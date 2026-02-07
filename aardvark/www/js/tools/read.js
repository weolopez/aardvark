/**
 * Read Tool - Read file contents with line numbers
 */
export async function readTool(args, context) {
  const { path, offset = 1, limit } = args;
  const { opfs } = context;
  
  try {
    const content = await opfs.readFile(path);
    const lines = content.split('\n');
    
    const start = Math.max(0, offset - 1);
    const end = limit ? Math.min(lines.length, start + limit) : lines.length;
    const selectedLines = lines.slice(start, end);
    
    return selectedLines
      .map((line, i) => `${start + i + 1} | ${line}`)
      .join('\n');
  } catch (error) {
    throw new Error(`Failed to read file "${path}": ${error.message}`);
  }
}

export const readToolSchema = {
  name: 'read',
  description: 'Read file contents with optional line offset and limit. Shows line numbers for reference.',
  parameters: {
    type: 'object',
    properties: {
      path: { 
        type: 'string',
        description: 'Path to the file to read'
      },
      offset: { 
        type: 'number', 
        description: '1-indexed line number to start from (default: 1)'
      },
      limit: { 
        type: 'number', 
        description: 'Maximum number of lines to read'
      }
    },
    required: ['path']
  }
};

export default readTool;
