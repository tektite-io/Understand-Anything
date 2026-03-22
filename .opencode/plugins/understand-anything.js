/**
 * Understand Anything plugin for OpenCode.ai
 *
 * Auto-registers the skills directory so OpenCode discovers all
 * understand-anything skills without manual symlinks or config edits.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const UnderstandAnythingPlugin = async ({ client, directory }) => {
  const skillsDir = path.resolve(__dirname, '../../understand-anything-plugin/skills');

  return {
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(skillsDir)) {
        config.skills.paths.push(skillsDir);
      }
    },
  };
};
