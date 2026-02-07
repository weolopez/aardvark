# OPFS Provider Component

Wrapper around Origin Private File System API for persistent file storage.

## Overview

The OPFS Provider provides a simple interface for reading, writing, and managing files using the browser's Origin Private File System (OPFS). All operations are sandboxed to the application origin.

## Features

- **File Operations**: Read, write, and delete files
- **Directory Management**: Create, list, and traverse directories
- **Path-based API**: Use familiar file paths (e.g., "src/main.rs")
- **Auto-creation**: Parent directories created automatically
- **Recursive Operations**: Walk directory trees

## Installation

```javascript
import { OPFSProvider } from './src/index.js';
```

## Usage

### Basic Example

```javascript
import { OPFSProvider } from './src/index.js';

const opfs = new OPFSProvider();
await opfs.initialize();

// Write a file
await opfs.writeFile('src/main.rs', 'fn main() {}');

// Read a file
const content = await opfs.readFile('src/main.rs');
console.log(content); // 'fn main() {}'

// List directory
const entries = await opfs.readDir('src');
```

### File Operations

```javascript
import { opfs } from './src/index.js';

await opfs.initialize();

// Write nested files (directories created automatically)
await opfs.writeFile('projects/app/src/index.js', 'console.log("hello")');

// Read file
const code = await opfs.readFile('projects/app/src/index.js');

// Check if exists
const exists = await opfs.exists('projects/app/src/index.js');

// Delete file
await opfs.delete('projects/app/src/index.js');
```

### Directory Operations

```javascript
// Create directory
await opfs.createDir('data/config');

// List directory contents
const entries = await opfs.readDir('data');
// Returns: [{ name: 'config', path: 'data/config', type: 'directory', handle }, ...]

// Walk directory tree
await opfs.walkDir('', (entry) => {
  console.log(entry.path, entry.type);
});

// Delete directory recursively
await opfs.delete('data', { recursive: true });
```

### Global Instance

```javascript
import { opfs } from './src/index.js';

// Use global instance
await opfs.initialize();
await opfs.writeFile('config.json', '{}');
```

## API Reference

### OPFSProvider

#### Methods

- `initialize()` - Initialize and get root directory
- `readFile(path)` - Read file content as string
- `writeFile(path, content)` - Write string content to file
- `readDir(path)` - List directory entries
- `exists(path)` - Check if path exists
- `delete(path, options)` - Delete file or directory
- `walkDir(path, callback)` - Recursively walk directory
- `createDir(path)` - Create directory

### Entry Object

Directory entries returned by `readDir()`:

```javascript
{
  name: 'file.txt',      // Entry name
  path: 'src/file.txt',  // Full path
  type: 'file',          // 'file' or 'directory'
  handle: FileHandle     // FileSystemHandle
}
```

## Browser Support

- Chrome 86+
- Edge 86+
- Firefox 111+
- Safari 15.2+

OPFS requires a secure context (HTTPS or localhost).

## Testing

Open `tests/unit/opfs-provider.spec.html` in a browser to run tests.

## Architecture

- **Promise-based**: All methods return promises
- **Error handling**: Throws on file not found or permission errors
- **Automatic directories**: Creates parent directories as needed
- **Type safety**: Returns typed entries from readDir()

## License

MIT
