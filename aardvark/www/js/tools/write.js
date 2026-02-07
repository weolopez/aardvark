/**
 * Write Tool - Write or create files
 */
export async function writeTool(args, context) {
  const { path, content } = args;
  const { opfs } = context;
  
  try {
    await opfs.writeFile(path, content);
    return `Successfully wrote ${path} (${content.length} bytes)`;
  } catch (error) {
    throw new Error(`Failed to write file "${path}": ${error.message}`);
  }
}

export const writeToolSchema = {
  name: 'write',
  description: 'Write or create a file. Creates parent directories automatically.',
  parameters: {
    type: 'object',
    properties: {
      path: { 
        type: 'string',
        description: 'Path to the file'
      },
      content: { 
        type: 'string',
        description: 'Content to write'
      }
    },
    required: ['path', 'content']
  }
};

export default writeTool;
