/**
 * File-backed agent registry for attestation.
 * Persists registered agents (TPM and Fido2) to JSON.
 */

import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  RegisteredAgent,
  TpmRegisteredAgent,
  Fido2RegisteredAgent,
} from './verifier.js';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';

interface AgentStore {
  agents: Array<
    | (TpmRegisteredAgent & { agentId: string })
    | (Fido2RegisteredAgent & { agentId: string })
  >;
}

const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class FileAgentRegistry {
  private readonly filePath: string;
  private cache: Map<string, RegisteredAgent> = new Map();
  private challenges: Map<string, { challenge: string; expires: number }> =
    new Map();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /** Generate FIDO2 registration options. Stores challenge for later verification. */
  async getRegistrationOptions(agentId: string) {
    const rpID = process.env.RP_ID ?? 'localhost';
    const rpName = process.env.RP_NAME ?? 'ernest-mail';
    const origin =
      process.env.RP_ORIGIN ?? `http://127.0.0.1:${process.env.PORT ?? 3100}`;

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: agentId,
      userDisplayName: agentId,
      attestationType: 'none',
      excludeCredentials: [],
      supportedAlgorithmIDs: [-7, -257],
    });

    this.challenges.set(agentId, {
      challenge: options.challenge,
      expires: Date.now() + CHALLENGE_TTL_MS,
    });
    return options;
  }

  async load(): Promise<void> {
    try {
      await fs.mkdir(dirname(this.filePath), { recursive: true });
      const raw = await fs.readFile(this.filePath, 'utf8');
      const store = JSON.parse(raw) as AgentStore;
      this.cache.clear();
      if (Array.isArray(store.agents)) {
        for (const a of store.agents) {
          const agent: RegisteredAgent =
            a.format === 'tpm'
              ? {
                  agentId: a.agentId,
                  format: 'tpm',
                  publicKey: (a as TpmRegisteredAgent).publicKey,
                  createdAt: (a as TpmRegisteredAgent).createdAt,
                }
              : {
                  agentId: a.agentId,
                  format: 'fido2',
                  credentialId: (a as Fido2RegisteredAgent).credentialId,
                  publicKey: new Uint8Array(
                    (a as Fido2RegisteredAgent & { publicKey: number[] })
                      .publicKey
                  ),
                  counter: (a as Fido2RegisteredAgent).counter,
                  transports: (a as Fido2RegisteredAgent).transports,
                  createdAt: (a as Fido2RegisteredAgent).createdAt,
                };
          this.cache.set(a.agentId, agent);
          if (a.format === 'fido2') {
            this.cache.set(
              (a as Fido2RegisteredAgent).credentialId,
              agent as Fido2RegisteredAgent
            );
          }
        }
      }
    } catch {
      this.cache.clear();
    }
  }

  async save(): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    const seen = new Set<string>();
    const agents: AgentStore['agents'] = [];
    for (const [k, a] of this.cache) {
      if (a.agentId === k && (a.format === 'tpm' || a.format === 'fido2')) {
        if (seen.has(a.agentId)) continue;
        seen.add(a.agentId);
        agents.push(
          a.format === 'fido2'
            ? { ...a, publicKey: Array.from(a.publicKey) }
            : (a as TpmRegisteredAgent & { agentId: string })
        );
      }
    }
    const store: AgentStore = { agents };
    await fs.writeFile(
      this.filePath,
      JSON.stringify(store, null, 2) + '\n',
      'utf8'
    );
  }

  getRegistry(): Map<string, RegisteredAgent> {
    const reg = new Map<string, RegisteredAgent>();
    for (const [k, v] of this.cache) {
      if (v.format === 'tpm' || (v.format === 'fido2' && k === v.agentId)) {
        reg.set(v.agentId, v);
      }
    }
    return reg;
  }

  /** Registry for attestation verifier (agentId -> agent). */
  getForVerification(): Map<string, RegisteredAgent> {
    const reg = new Map<string, RegisteredAgent>();
    for (const [k, v] of this.cache) {
      if (k === v.agentId && (v.format === 'tpm' || v.format === 'fido2')) {
        reg.set(v.agentId, v);
      }
    }
    return reg;
  }

  async registerTpm(
    agentId: string,
    publicKey: string
  ): Promise<TpmRegisteredAgent> {
    await this.load();
    const agent: TpmRegisteredAgent = {
      agentId,
      format: 'tpm',
      publicKey,
      createdAt: new Date().toISOString(),
    };
    this.cache.set(agentId, agent);
    await this.save();
    return agent;
  }

  async registerFido2(
    agentId: string,
    response: RegistrationResponseJSON,
    expectedChallenge?: string
  ): Promise<Fido2RegisteredAgent> {
    const rpID = process.env.RP_ID ?? 'localhost';
    const origin =
      process.env.RP_ORIGIN ?? `http://127.0.0.1:${process.env.PORT ?? 3100}`;

    const stored = this.challenges.get(agentId);
    if (stored && Date.now() < stored.expires) {
      this.challenges.delete(agentId);
      expectedChallenge = stored.challenge;
    }
    if (!expectedChallenge) {
      throw new Error(
        'expectedChallenge required. Call GET /agents/register/options first, or pass expectedChallenge.'
      );
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('FIDO2 registration verification failed');
    }

    const { credential } = verification.registrationInfo;
    const agent: Fido2RegisteredAgent = {
      agentId,
      format: 'fido2',
      credentialId: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports,
      createdAt: new Date().toISOString(),
    };

    await this.load();
    this.cache.set(agentId, agent);
    this.cache.set(credential.id, agent);
    await this.save();
    return agent;
  }
}
