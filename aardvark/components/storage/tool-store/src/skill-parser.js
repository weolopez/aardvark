/**
 * SKILL.md Parser
 * Parses YAML frontmatter and markdown content from SKILL.md files
 */

/**
 * @typedef {Object} ParsedSkillMd
 * @property {SkillFrontmatter} frontmatter - Parsed YAML frontmatter
 * @property {string} instructions - Markdown content after frontmatter
 */

/**
 * @typedef {Object} SkillFrontmatter
 * @property {string} name - Tool identifier
 * @property {string} description - Tool description
 * @property {string} [allowedTools] - Comma-separated list of allowed tools
 * @property {string} [version] - Tool version
 * @property {string} [author] - Tool author
 */

/**
 * Parse SKILL.md content into frontmatter and instructions
 * @param {string} content - Raw SKILL.md content
 * @returns {ParsedSkillMd} Parsed frontmatter and instructions
 * @throws {Error} If format is invalid
 */
export function parseSkillMd(content) {
  // Match frontmatter between --- delimiters
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    throw new Error('Invalid SKILL.md format: missing frontmatter delimiter (---)');
  }
  
  const frontmatterYaml = frontmatterMatch[1].trim();
  const instructions = frontmatterMatch[2].trim();
  
  // Parse YAML frontmatter using js-yaml (loaded from CDN in browser)
  let frontmatter;
  try {
    // js-yaml will be available globally when loaded from CDN
    frontmatter = window.jsyaml.load(frontmatterYaml);
  } catch (e) {
    throw new Error(`Invalid YAML in frontmatter: ${e.message}`);
  }
  
  // Validate required fields
  if (!frontmatter.name) {
    throw new Error('Invalid SKILL.md: missing required field "name" in frontmatter');
  }
  
  if (!frontmatter.description) {
    throw new Error('Invalid SKILL.md: missing required field "description" in frontmatter');
  }
  
  // Normalize allowed-tools field
  if (frontmatter['allowed-tools']) {
    frontmatter.allowedTools = frontmatter['allowed-tools'];
    delete frontmatter['allowed-tools'];
  }
  
  return {
    frontmatter: {
      name: frontmatter.name,
      description: frontmatter.description,
      allowedTools: frontmatter.allowedTools || '',
      version: frontmatter.version || '1.0.0',
      author: frontmatter.author || 'Unknown'
    },
    instructions
  };
}

/**
 * Extract tool parameters from SKILL.md instructions
 * Looks for JSON schema in the instructions
 * @param {string} instructions - Markdown instructions content
 * @returns {Object|null} JSON schema object or null if not found
 */
export function extractParametersSchema(instructions) {
  // Look for ```json or ```javascript code blocks containing schema
  const schemaMatch = instructions.match(/```(?:json|javascript)?\n([\s\S]*?schemas?[\s\S]*?)\n```/i);
  
  if (schemaMatch) {
    try {
      const schema = JSON.parse(schemaMatch[1]);
      if (schema.type === 'object' && schema.properties) {
        return schema;
      }
    } catch (e) {
      // Invalid JSON, ignore
    }
  }
  
  // Default schema based on example in instructions
  const exampleMatch = instructions.match(/Input:\s*`?({[\s\S]*?})`?/);
  if (exampleMatch) {
    try {
      const example = JSON.parse(exampleMatch[1]);
      const properties = {};
      const required = [];
      
      for (const [key, value] of Object.entries(example)) {
        properties[key] = {
          type: typeof value,
          description: `Parameter ${key}`
        };
        required.push(key);
      }
      
      return {
        type: 'object',
        properties,
        required
      };
    } catch (e) {
      // Invalid JSON, ignore
    }
  }
  
  // Return default empty schema
  return {
    type: 'object',
    properties: {},
    required: []
  };
}

/**
 * Generate JSON schema from example input
 * @param {Object} example - Example input object
 * @returns {Object} JSON schema
 */
export function generateSchemaFromExample(example) {
  const properties = {};
  const required = Object.keys(example);
  
  for (const [key, value] of Object.entries(example)) {
    const type = Array.isArray(value) ? 'array' : typeof value;
    properties[key] = {
      type,
      description: `Parameter ${key}`
    };
    
    if (type === 'array' && value.length > 0) {
      properties[key].items = {
        type: typeof value[0]
      };
    }
  }
  
  return {
    type: 'object',
    properties,
    required
  };
}
