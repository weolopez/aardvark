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

  // Normalize YAML by handling indented root-level fields
  // Root-level field definitions (e.g., "name:", "description:") should not be indented
  // But preserve indentation for multiline values
  const lines = frontmatterMatch[1].split('\n');
  const normalizedLines = [];
  let inMultiline = false;
  let baseIndent = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (trimmed === '') {
      normalizedLines.push('');
      continue;
    }
    
    // Check if this is a root-level field definition (contains unquoted colon at root level)
    const isFieldDefinition = /^[a-zA-Z0-9_-]+:/.test(trimmed);
    
    if (isFieldDefinition) {
      // Check if it's a multiline indicator (ends with | or >)
      inMultiline = /[:|>]\s*$/.test(trimmed);
      baseIndent = line.search(/\S/);
      normalizedLines.push(trimmed);
    } else if (inMultiline) {
      // In multiline mode, preserve relative indentation
      const currentIndent = line.search(/\S/);
      if (currentIndent > baseIndent || trimmed === '') {
        normalizedLines.push(line);
      } else {
        // Exiting multiline mode
        inMultiline = false;
        normalizedLines.push(trimmed);
      }
    } else {
      // Regular line, trim it
      normalizedLines.push(trimmed);
    }
  }
  
  const frontmatterYaml = normalizedLines.join('\n').trim();
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
  // Look for ```json or ```javascript code blocks containing JSON schema
  const schemaBlockMatch = instructions.match(/```(?:json|javascript)?\n([\s\S]*?)\n```/i);
  
  if (schemaBlockMatch) {
    try {
      const content = schemaBlockMatch[1];
      // Try to parse the entire block as JSON schema
      const schema = JSON.parse(content);
      if (schema.type === 'object' && schema.properties) {
        return schema;
      }
    } catch (e) {
      // Invalid JSON, ignore and fall through to example parsing
    }
  }
  
  // Default schema based on example in instructions
  // Match JSON after "Input:" - handle nested objects by counting braces
  const exampleMatch = instructions.match(/Input:\s*`?({[\s\S]*})`?/);
  if (exampleMatch) {
    try {
      // Try to find valid JSON by matching braces
      let jsonStr = exampleMatch[1];
      let braceCount = 0;
      let endIndex = 0;
      
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === '{') braceCount++;
        else if (jsonStr[i] === '}') braceCount--;
        
        if (braceCount === 0) {
          endIndex = i + 1;
          break;
        }
      }
      
      jsonStr = jsonStr.substring(0, endIndex);
      const example = JSON.parse(jsonStr);
      
      function getType(value) {
        if (Array.isArray(value)) return 'array';
        if (value === null) return 'null';
        return typeof value;
      }
      
      function buildSchema(obj) {
        const type = getType(obj);
        
        if (type === 'object') {
          const properties = {};
          const required = Object.keys(obj);
          
          for (const [key, val] of Object.entries(obj)) {
            properties[key] = buildSchema(val);
          }
          
          return { type, properties, required };
        } else if (type === 'array') {
          const schema = { type };
          if (obj.length > 0) {
            schema.items = buildSchema(obj[0]);
          }
          return schema;
        } else {
          return { type, description: `Parameter` };
        }
      }
      
      return buildSchema(example);
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
