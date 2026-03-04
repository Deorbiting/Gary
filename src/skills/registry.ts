import { existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import type { SkillMetadata, Skill, SkillSource } from './types.js';
import { extractSkillMetadata, loadSkillFromPath } from './loader.js';

// Get the directory of this file to locate builtin skills
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Skill directories in order of precedence (later overrides earlier).
 * Supports both .gary and .agents directories for compatibility with
 * skills installed via `npx skills add`.
 */
const SKILL_DIRECTORIES: { path: string; source: SkillSource }[] = [
  { path: __dirname, source: 'builtin' },
  { path: join(homedir(), '.gary', 'skills'), source: 'user' },
  { path: join(process.cwd(), '.gary', 'skills'), source: 'project' },
  // Also check .agents/skills for compatibility with `npx skills add`
  { path: join(process.cwd(), '.agents', 'skills'), source: 'project' },
];

// Cache for discovered skills (metadata only)
let skillMetadataCache: Map<string, SkillMetadata> | null = null;

// Cache for pre-loaded full skills (embedded at build time for desktop apps)
const embeddedSkillCache = new Map<string, Skill>();

/**
 * Register pre-loaded skills (e.g. embedded at build time in Electron).
 * These are used when filesystem-based discovery isn't possible.
 * Must be called before Agent.create() / discoverSkills().
 */
export function registerEmbeddedSkills(skills: Skill[]): void {
  for (const skill of skills) {
    embeddedSkillCache.set(skill.name, skill);
  }
  // Clear metadata cache so discoverSkills() picks up embedded skills
  skillMetadataCache = null;
}

/**
 * Scan a directory for SKILL.md files and return their metadata.
 * Looks for directories containing SKILL.md files.
 *
 * @param dirPath - Directory to scan
 * @param source - Source type for discovered skills
 * @returns Array of skill metadata
 */
function scanSkillDirectory(dirPath: string, source: SkillSource): SkillMetadata[] {
  if (!existsSync(dirPath)) {
    return [];
  }

  const skills: SkillMetadata[] = [];
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillFilePath = join(dirPath, entry.name, 'SKILL.md');
      if (existsSync(skillFilePath)) {
        try {
          const metadata = extractSkillMetadata(skillFilePath, source);
          skills.push(metadata);
        } catch {
          // Skip invalid skill files silently
        }
      }
    }
  }

  return skills;
}

/**
 * Discover all available skills from all skill directories.
 * Later sources (project > user > builtin) override earlier ones.
 *
 * @returns Array of skill metadata, deduplicated by name
 */
export function discoverSkills(): SkillMetadata[] {
  if (skillMetadataCache) {
    return Array.from(skillMetadataCache.values());
  }

  skillMetadataCache = new Map();

  // Start with embedded skills (lowest precedence)
  for (const [name, skill] of embeddedSkillCache) {
    skillMetadataCache.set(name, { name: skill.name, description: skill.description, path: skill.path, source: skill.source });
  }

  for (const { path, source } of SKILL_DIRECTORIES) {
    const skills = scanSkillDirectory(path, source);
    for (const skill of skills) {
      // Later sources override earlier ones (by name)
      skillMetadataCache.set(skill.name, skill);
    }
  }

  return Array.from(skillMetadataCache.values());
}

/**
 * Get a skill by name, loading full instructions.
 *
 * @param name - Name of the skill to load
 * @returns Full skill definition or undefined if not found
 */
export function getSkill(name: string): Skill | undefined {
  // Ensure cache is populated
  if (!skillMetadataCache) {
    discoverSkills();
  }

  // Check embedded skills first (they have full instructions already)
  const embedded = embeddedSkillCache.get(name);
  if (embedded) return embedded;

  const metadata = skillMetadataCache?.get(name);
  if (!metadata) {
    return undefined;
  }

  // Load full skill with instructions from disk
  try {
    return loadSkillFromPath(metadata.path, metadata.source);
  } catch {
    return undefined;
  }
}

/**
 * Build the skill metadata section for the system prompt.
 * Only includes name and description (lightweight).
 *
 * @returns Formatted string for system prompt injection
 */
export function buildSkillMetadataSection(): string {
  const skills = discoverSkills();

  if (skills.length === 0) {
    return 'No skills available.';
  }

  return skills
    .map((s) => `- **${s.name}**: ${s.description}`)
    .join('\n');
}

/**
 * Clear the skill cache. Useful for testing or when skills are added/removed.
 */
export function clearSkillCache(): void {
  skillMetadataCache = null;
}
