/**
 * Tool Definition Validator
 * Validates tool definitions and SKILL.md content
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {ValidationError[]} errors - Array of validation errors
 */

/**
 * @typedef {Object} ValidationError
 * @property {string} field - Field that failed validation
 * @property {string} message - Error message
 */

/**
 * @typedef {Object} ToolDefinition
 * @property {string} name - Tool identifier
 * @property {string} description - Tool description
 * @property {Object} parameters - JSON schema for parameters
 * @property {string[]} allowedTools - List of allowed sub-tools
 * @property {string} version - Tool version
 * @property {string} repo - Repository name
 * @property {string} skillMdPath - Path to SKILL.md file
 * @property {string} [instructions] - Full instructions content
 */

/**
 * Validate a tool definition
 * @param {ToolDefinition} def - Tool definition to validate
 * @returns {ValidationResult} Validation result
 */
export function validateToolDefinition(def) {
  const errors = [];
  
  // Required fields
  if (!def.name || typeof def.name !== 'string' || def.name.trim() === '') {
    errors.push({ field: 'name', message: 'Tool name is required and must be a non-empty string' });
  } else if (!/^[a-z0-9-]+$/.test(def.name)) {
    errors.push({ field: 'name', message: 'Tool name must contain only lowercase letters, numbers, and hyphens' });
  }
  
  if (!def.description || typeof def.description !== 'string' || def.description.trim() === '') {
    errors.push({ field: 'description', message: 'Tool description is required and must be a non-empty string' });
  }
  
  if (!def.repo || typeof def.repo !== 'string') {
    errors.push({ field: 'repo', message: 'Repository name is required' });
  }
  
  if (!def.skillMdPath || typeof def.skillMdPath !== 'string') {
    errors.push({ field: 'skillMdPath', message: 'SKILL.md path is required' });
  }
  
  // Validate parameters schema if present
  if (def.parameters) {
    const paramErrors = validateParametersSchema(def.parameters);
    errors.push(...paramErrors.map(e => ({ field: `parameters.${e.field}`, message: e.message })));
  }
  
  // Validate allowedTools
  if (def.allowedTools && !Array.isArray(def.allowedTools)) {
    errors.push({ field: 'allowedTools', message: 'allowedTools must be an array' });
  }
  
  // Validate version format (semver-like)
  if (def.version && !/^\d+\.\d+\.\d+/.test(def.version)) {
    errors.push({ field: 'version', message: 'Version should follow semantic versioning (e.g., 1.0.0)' });
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate JSON schema for parameters
 * @param {Object} schema - JSON schema object
 * @returns {ValidationError[]} Array of validation errors
 */
function validateParametersSchema(schema) {
  const errors = [];
  
  if (!schema || typeof schema !== 'object') {
    errors.push({ field: '', message: 'Parameters schema must be an object' });
    return errors;
  }
  
  if (schema.type !== 'object') {
    errors.push({ field: 'type', message: 'Parameters schema type must be "object"' });
  }
  
  if (!schema.properties || typeof schema.properties !== 'object') {
    errors.push({ field: 'properties', message: 'Parameters schema must have a properties object' });
  } else {
    // Validate each property
    for (const [propName, propDef] of Object.entries(schema.properties)) {
      if (!propDef.type) {
        errors.push({ field: `properties.${propName}.type`, message: `Property "${propName}" must have a type` });
      } else {
        const validTypes = ['string', 'number', 'boolean', 'array', 'object', 'integer'];
        if (!validTypes.includes(propDef.type)) {
          errors.push({ field: `properties.${propName}.type`, message: `Property "${propName}" has invalid type "${propDef.type}"` });
        }
      }
      
      if (propDef.description && typeof propDef.description !== 'string') {
        errors.push({ field: `properties.${propName}.description`, message: `Property "${propName}" description must be a string` });
      }
    }
  }
  
  // Validate required array if present
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required)) {
      errors.push({ field: 'required', message: 'Required must be an array of property names' });
    } else {
      for (const req of schema.required) {
        if (typeof req !== 'string') {
          errors.push({ field: 'required', message: 'Required array must contain only strings' });
          break;
        }
        if (schema.properties && !schema.properties[req]) {
          errors.push({ field: 'required', message: `Required property "${req}" not found in properties` });
        }
      }
    }
  }
  
  return errors;
}

/**
 * Validate SKILL.md content before parsing
 * @param {string} content - Raw SKILL.md content
 * @returns {ValidationResult} Validation result
 */
export function validateSkillMdContent(content) {
  const errors = [];
  
  if (!content || typeof content !== 'string') {
    errors.push({ field: 'content', message: 'Content must be a non-empty string' });
    return { valid: false, errors };
  }
  
  // Check for frontmatter delimiters
  if (!content.startsWith('---')) {
    errors.push({ field: 'frontmatter', message: 'SKILL.md must start with frontmatter delimiter (---)' });
  }
  
  const frontmatterEnd = content.indexOf('---', 3);
  if (frontmatterEnd === -1) {
    errors.push({ field: 'frontmatter', message: 'SKILL.md frontmatter must end with delimiter (---)' });
  }
  
  // Check for minimum content
  if (content.length < 50) {
    errors.push({ field: 'content', message: 'SKILL.md content is too short' });
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate pending tool input
 * @param {Object} tool - Pending tool input
 * @returns {ValidationResult} Validation result
 */
export function validatePendingToolInput(tool) {
  const errors = [];
  
  if (!tool.name || typeof tool.name !== 'string') {
    errors.push({ field: 'name', message: 'Tool name is required' });
  }
  
  if (!tool.description || typeof tool.description !== 'string') {
    errors.push({ field: 'description', message: 'Tool description is required' });
  }
  
  if (!tool.skillMdContent || typeof tool.skillMdContent !== 'string') {
    errors.push({ field: 'skillMdContent', message: 'SKILL.md content is required' });
  } else {
    // Validate the SKILL.md content
    const contentValidation = validateSkillMdContent(tool.skillMdContent);
    if (!contentValidation.valid) {
      errors.push(...contentValidation.errors);
    }
  }
  
  if (!tool.requestedBy || !['llm', 'user'].includes(tool.requestedBy)) {
    errors.push({ field: 'requestedBy', message: 'requestedBy must be either "llm" or "user"' });
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
