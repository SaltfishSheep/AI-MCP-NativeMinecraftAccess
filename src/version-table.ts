import type { VersionConfig } from './types.js';

const NEOFORGE_MAVEN_BASE = 'https://maven.neoforged.net/releases/de/oceanlabs/mcp';

export const VERSION_TABLE: Record<string, VersionConfig> = {
  // ======================================================================
  // Legacy workflow: SRG + MCP Stable CSV
  // Available: 1.7.10 - 1.11.2
  // ======================================================================
  '1.7.10': {
    workflow: 'legacy_srg',
    srg_url: `${NEOFORGE_MAVEN_BASE}/mcp/1.7.10/mcp-1.7.10-srg.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/12-1.7.10/mcp_stable-12-1.7.10.zip`,
    proguard_url: null,
  },
  '1.8': {
    workflow: 'legacy_srg',
    srg_url: `${NEOFORGE_MAVEN_BASE}/mcp/1.8/mcp-1.8-srg.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/18-1.8/mcp_stable-18-1.8.zip`,
    proguard_url: null,
  },
  '1.8.8': {
    workflow: 'legacy_srg',
    srg_url: `${NEOFORGE_MAVEN_BASE}/mcp/1.8.8/mcp-1.8.8-srg.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/20-1.8.8/mcp_stable-20-1.8.8.zip`,
    proguard_url: null,
  },
  '1.8.9': {
    workflow: 'legacy_srg',
    srg_url: `${NEOFORGE_MAVEN_BASE}/mcp/1.8.9/mcp-1.8.9-srg.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/22-1.8.9/mcp_stable-22-1.8.9.zip`,
    proguard_url: null,
  },
  '1.9': {
    workflow: 'legacy_srg',
    srg_url: `${NEOFORGE_MAVEN_BASE}/mcp/1.9/mcp-1.9-srg.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/24-1.9/mcp_stable-24-1.9.zip`,
    proguard_url: null,
  },
  '1.9.4': {
    workflow: 'legacy_srg',
    srg_url: `${NEOFORGE_MAVEN_BASE}/mcp/1.9.4/mcp-1.9.4-srg.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/26-1.9.4/mcp_stable-26-1.9.4.zip`,
    proguard_url: null,
  },
  '1.10.2': {
    workflow: 'legacy_srg',
    srg_url: `${NEOFORGE_MAVEN_BASE}/mcp/1.10.2/mcp-1.10.2-srg.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/29-1.10.2/mcp_stable-29-1.10.2.zip`,
    proguard_url: null,
  },
  '1.11': {
    workflow: 'legacy_srg',
    srg_url: `${NEOFORGE_MAVEN_BASE}/mcp/1.11/mcp-1.11-srg.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/32-1.11/mcp_stable-32-1.11.zip`,
    proguard_url: null,
  },
  '1.11.2': {
    workflow: 'legacy_srg',
    srg_url: `${NEOFORGE_MAVEN_BASE}/mcp/1.11.2/mcp-1.11.2-srg.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/32-1.11/mcp_stable-32-1.11.zip`,
    proguard_url: null,
  },
  // ======================================================================
  // Legacy workflow: TSRGv1 + MCP Stable CSV
  // Available: 1.12.2 - 1.15.2
  // ======================================================================
  '1.12.2': {
    workflow: 'legacy',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.12.2/mcp_config-1.12.2.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/39-1.12/mcp_stable-39-1.12.zip`,
    proguard_url: null,
  },
  '1.13': {
    workflow: 'legacy',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.13/mcp_config-1.13.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/43-1.13/mcp_stable-43-1.13.zip`,
    proguard_url: null,
  },
  '1.13.1': {
    workflow: 'legacy',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.13.1/mcp_config-1.13.1.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/45-1.13.1/mcp_stable-45-1.13.1.zip`,
    proguard_url: null,
  },
  '1.13.2': {
    workflow: 'legacy',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.13.2/mcp_config-1.13.2.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/47-1.13.2/mcp_stable-47-1.13.2.zip`,
    proguard_url: null,
  },
  '1.14': {
    workflow: 'legacy',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.14/mcp_config-1.14.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/49-1.14/mcp_stable-49-1.14.zip`,
    proguard_url: null,
  },
  '1.14.1': {
    workflow: 'legacy',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.14.1/mcp_config-1.14.1.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/51-1.14.1/mcp_stable-51-1.14.1.zip`,
    proguard_url: null,
  },
  '1.14.2': {
    workflow: 'legacy',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.14.2/mcp_config-1.14.2.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/53-1.14.2/mcp_stable-53-1.14.2.zip`,
    proguard_url: null,
  },
  '1.14.3': {
    workflow: 'legacy',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.14.3/mcp_config-1.14.3.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/56-1.14.3/mcp_stable-56-1.14.3.zip`,
    proguard_url: null,
  },
  '1.14.4': {
    workflow: 'legacy',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.14.4/mcp_config-1.14.4.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/58-1.14.4/mcp_stable-58-1.14.4.zip`,
    proguard_url: null,
  },
  '1.15': {
    workflow: 'legacy',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.15/mcp_config-1.15.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/60-1.15/mcp_stable-60-1.15.zip`,
    proguard_url: null,
  },
  '1.15.1': {
    workflow: 'legacy',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.15.1/mcp_config-1.15.1.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/60-1.15/mcp_stable-60-1.15.zip`,
    proguard_url: null,
  },
  '1.15.2': {
    workflow: 'legacy',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.15.2/mcp_config-1.15.2.zip`,
    mcp_stable_url: `${NEOFORGE_MAVEN_BASE}/mcp_stable/60-1.15/mcp_stable-60-1.15.zip`,
    proguard_url: null,
  },
  // ======================================================================
  // Legacy workflow: TSRGv1 + ProGuard (1.16.x)
  // MCP was abandoned, so we use Mojang ProGuard instead
  // ======================================================================
  '1.16.1': {
    workflow: 'legacy_proguard',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.16.1/mcp_config-1.16.1.zip`,
    mcp_stable_url: null,
    proguard_url: 'https://piston-data.mojang.com/v1/objects/ddf517a4f6750f4c15189de4e03246ae1f916cf5/client.txt',
  },
  '1.16.2': {
    workflow: 'legacy_proguard',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.16.2/mcp_config-1.16.2.zip`,
    mcp_stable_url: null,
    proguard_url: 'https://piston-data.mojang.com/v1/objects/16d12d67cd5341bfc848340f61f3ff6b957537fe/client.txt',
  },
  '1.16.3': {
    workflow: 'legacy_proguard',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.16.3/mcp_config-1.16.3.zip`,
    mcp_stable_url: null,
    proguard_url: 'https://piston-data.mojang.com/v1/objects/faac5028fbca3859db970cc4ca041aeec55f6d9d/client.txt',
  },
  '1.16.4': {
    workflow: 'legacy_proguard',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.16.4/mcp_config-1.16.4.zip`,
    mcp_stable_url: null,
    proguard_url: 'https://piston-data.mojang.com/v1/objects/0837de813d1a6b67e23da3c520a84e872c8d2f0e/client.txt',
  },
  '1.16.5': {
    workflow: 'legacy_proguard',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.16.5/mcp_config-1.16.5.zip`,
    mcp_stable_url: null,
    proguard_url: 'https://piston-data.mojang.com/v1/objects/374c6b789574afbdc901371207155661e0509e17/client.txt',
  },
  // ======================================================================
  // Modern workflow: TSRGv2 + Mojang ProGuard
  // Available: 1.17 - 1.20.1
  // ======================================================================
  '1.17': {
    workflow: 'modern',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.17/mcp_config-1.17.zip`,
    mcp_stable_url: null,
    proguard_url: 'https://piston-data.mojang.com/v1/objects/227d16f520848747a59bef6f490ae19dc290a804/client.txt',
  },
  '1.17.1': {
    workflow: 'modern',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.17.1/mcp_config-1.17.1.zip`,
    mcp_stable_url: null,
    proguard_url: 'https://piston-data.mojang.com/v1/objects/e4d540e0cba05a6097e885dffdf363e621f87d3f/client.txt',
  },
  '1.18': {
    workflow: 'modern',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.18/mcp_config-1.18.zip`,
    mcp_stable_url: null,
    proguard_url: 'https://piston-data.mojang.com/v1/objects/e824c89c612c0b9cb438ef739c44726c59bbf679/client.txt',
  },
  '1.18.1': {
    workflow: 'modern',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.18.1/mcp_config-1.18.1.zip`,
    mcp_stable_url: null,
    proguard_url: 'https://piston-data.mojang.com/v1/objects/99ade839eacf69b8bed88c91bd70ca660aee47bb/client.txt',
  },
  '1.18.2': {
    workflow: 'modern',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.18.2/mcp_config-1.18.2.zip`,
    mcp_stable_url: null,
    proguard_url: 'https://piston-data.mojang.com/v1/objects/a661c6a55a0600bd391bdbbd6827654c05b2109c/client.txt',
  },
  '1.19': {
    workflow: 'modern',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.19/mcp_config-1.19.zip`,
    mcp_stable_url: null,
    proguard_url: 'https://piston-data.mojang.com/v1/objects/150346d1c0b4acec0b4eb7f58b86e3ea1aa730f3/client.txt',
  },
  '1.19.1': {
    workflow: 'modern',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.19.1/mcp_config-1.19.1.zip`,
    mcp_stable_url: null,
    proguard_url: 'https://piston-data.mojang.com/v1/objects/fc8e22d42c0e4eb1899e2acf7e97eae917e1cb94/client.txt',
  },
  '1.19.2': {
    workflow: 'modern',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.19.2/mcp_config-1.19.2.zip`,
    mcp_stable_url: null,
    proguard_url: 'https://piston-data.mojang.com/v1/objects/8e8c9be5dc27802caba47053d4fdea328f7f89bd/client.txt',
  },
  '1.19.3': {
    workflow: 'modern',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.19.3/mcp_config-1.19.3.zip`,
    mcp_stable_url: null,
    proguard_url: 'https://piston-data.mojang.com/v1/objects/42366909cc612e76208d34bf1356f05a88e08a1d/client.txt',
  },
  '1.19.4': {
    workflow: 'modern',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.19.4/mcp_config-1.19.4.zip`,
    mcp_stable_url: null,
    proguard_url: 'https://piston-data.mojang.com/v1/objects/f14771b764f943c154d3a6fcb47694477e328148/client.txt',
  },
  '1.20': {
    workflow: 'modern',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.20/mcp_config-1.20.zip`,
    mcp_stable_url: null,
    proguard_url: 'https://piston-data.mojang.com/v1/objects/a4cd9a97400f7ecfe4dba23e427549ebc5815d66/client.txt',
  },
  '1.20.1': {
    workflow: 'modern',
    tsrg_url: `${NEOFORGE_MAVEN_BASE}/mcp_config/1.20.1/mcp_config-1.20.1.zip`,
    mcp_stable_url: null,
    proguard_url: 'https://piston-data.mojang.com/v1/objects/6c48521eed01fe2e8ecdadbd5ae348415f3c47da/client.txt',
  },
};
