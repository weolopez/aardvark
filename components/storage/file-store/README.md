# File Store Component

Repository file management with GitHub integration. Provides high-level file operations with repository namespacing, caching, and event notifications.

## Overview

The File Store builds on top of the OPFS Provider to provide:
- Repository namespacing (each repo is isolated)
- GitHub repository loading
- File tree caching
- Path normalization
- Event-driven updates
- Repository statistics

## Installation

```javascript
import { FileStore } from './src/index.js';
```

## Usage

### Basic Setup

```javascript
import { FileStore } from './components/storage/file-store/src/index.js';
import { EventBus } from './components/core/event-bus/src/index.js';

const eventBus = new EventBus();
const fileStore = new FileStore({ eventBus });

await fileStore.initialize();
```

### Repository Management

```javascript
// Create a repository
await fileStore.createRepo('myproject');

// List all repositories
const repos = await fileStore.listRepos();

// Get repository info
const info = await fileStore.getRepoInfo('myproject');

// Delete a repository
await fileStore.deleteRepo('myproject');
```

### File Operations

```javascript
// Write a file
await fileStore.write('myproject', 'src/main.js', 'console.log("Hello");');

// Read a file
const content = await fileStore.read('myproject', 'src/main.js');

// Check if file exists
const exists = await fileStore.exists('myproject', 'src/main.js');

// Delete a file
await fileStore.delete('myproject', 'src/main.js');
```

### Directory Operations

```javascript
// List directory contents
const entries = await fileStore.list('myproject', 'src');

// Walk directory tree
const allFiles = await fileStore.walk('myproject');

// Find files by glob pattern
const jsFiles = await fileStore.glob('myproject', '**/*.js');
```

### GitHub Integration

```javascript
// Load repository from GitHub
await fileStore.loadFromGitHub(
  'react-local',     // Local repository name
  'facebook',        // GitHub owner
  'react',           // Repository name
  'main',            // Branch (optional)
  {
    token: 'ghp_...', // GitHub token (optional, for private repos)
    onProgress: (progress) => {
      console.log(`${progress.percentage}% - ${progress.currentFile}`);
    }
  }
);
```

### Repository Statistics

```javascript
const stats = await fileStore.getRepoStats('myproject');

console.log(stats.fileCount);        // Number of files
console.log(stats.directoryCount);   // Number of directories
console.log(stats.totalSize);        // Total size in bytes
console.log(stats.languages);        // Map of extension -> file count
```

## Events

The File Store publishes events via the Event Bus:

### Repository Events

```javascript
// Repository created
eventBus.subscribe('repo:created', ({ repo }) => {
  console.log(`Repository created: ${repo}`);
});

// Repository deleted
eventBus.subscribe('repo:deleted', ({ repo }) => {
  console.log(`Repository deleted: ${repo}`);
});

// Repository loading from GitHub
eventBus.subscribe('repo:loading', ({ repo, owner, name }) => {
  console.log(`Loading ${owner}/${name}...`);
});

// Repository loaded
eventBus.subscribe('repo:loaded', ({ repo, fileCount }) => {
  console.log(`Loaded ${fileCount} files`);
});

// Repository load error
eventBus.subscribe('repo:load-error', ({ repo, error }) => {
  console.error(`Failed to load: ${error}`);
});
```

### File Events

```javascript
// File created
eventBus.subscribe('file:created', ({ repo, path, size }) => {
  console.log(`Created: ${repo}/${path} (${size} bytes)`);
});

// File updated
eventBus.subscribe('file:updated', ({ repo, path, size }) => {
  console.log(`Updated: ${repo}/${path} (${size} bytes)`);
});

// File deleted
eventBus.subscribe('file:deleted', ({ repo, path }) => {
  console.log(`Deleted: ${repo}/${path}`);
});
```

## API Reference

### FileStore

#### Constructor
```javascript
new FileStore(options)
```

**Options:**
- `opfs` (OPFSProvider): OPFS Provider instance (optional, creates default)
- `eventBus` (EventBus): Event Bus instance (optional, creates default)

#### Methods

##### `initialize()`
Initialize the file store. Creates the repos directory if it doesn't exist.

##### `createRepo(name)`
Create a new repository.
- **name** (string): Repository name
- **Returns**: Promise<void>

##### `deleteRepo(name)`
Delete a repository and all its contents.
- **name** (string): Repository name
- **Returns**: Promise<void>

##### `listRepos()`
List all repositories.
- **Returns**: Promise<RepoInfo[]>

##### `getRepoInfo(name)`
Get repository metadata.
- **name** (string): Repository name
- **Returns**: Promise<RepoInfo>

##### `read(repo, path)`
Read a file.
- **repo** (string): Repository name
- **path** (string): File path
- **Returns**: Promise<string>

##### `write(repo, path, content)`
Write a file.
- **repo** (string): Repository name
- **path** (string): File path
- **content** (string): File content
- **Returns**: Promise<void>

##### `delete(repo, path)`
Delete a file.
- **repo** (string): Repository name
- **path** (string): File path
- **Returns**: Promise<void>

##### `exists(repo, path)`
Check if a file exists.
- **repo** (string): Repository name
- **path** (string): File path
- **Returns**: Promise<boolean>

##### `list(repo, path)`
List directory contents.
- **repo** (string): Repository name
- **path** (string): Directory path (optional)
- **Returns**: Promise<DirEntry[]>

##### `walk(repo, path)`
Walk directory tree recursively.
- **repo** (string): Repository name
- **path** (string): Starting path (optional)
- **Returns**: Promise<string[]> (array of file paths)

##### `glob(repo, pattern)`
Find files matching a glob pattern.
- **repo** (string): Repository name
- **pattern** (string): Glob pattern (e.g., "*.js", "src/**/*.rs")
- **Returns**: Promise<string[]>

##### `getMetadata(repo, path)`
Get file metadata.
- **repo** (string): Repository name
- **path** (string): File path
- **Returns**: Promise<FileMetadata>

##### `getRepoStats(repo)`
Get repository statistics.
- **repo** (string): Repository name
- **Returns**: Promise<RepoStats>

##### `loadFromGitHub(repo, owner, repoName, branch, options)`
Load repository from GitHub.
- **repo** (string): Local repository name to create
- **owner** (string): GitHub owner
- **repoName** (string): GitHub repository name
- **branch** (string): Branch to load (default: 'main')
- **options** (object):
  - `token` (string): GitHub token for private repos
  - `onProgress` (function): Progress callback
- **Returns**: Promise<LoadProgress>

### Types

#### RepoInfo
```javascript
{
  name: string,
  created: number,
  modified: number,
  fileCount: number,
  totalSize: number
}
```

#### DirEntry
```javascript
{
  name: string,
  path: string,
  type: 'file' | 'directory',
  size?: number,
  modified?: number
}
```

#### FileMetadata
```javascript
{
  path: string,
  size: number,
  created: number,
  modified: number
}
```

#### RepoStats
```javascript
{
  fileCount: number,
  directoryCount: number,
  totalSize: number,
  languages: Map<string, number>
}
```

#### LoadProgress
```javascript
{
  totalFiles: number,
  loadedFiles: number,
  currentFile: string,
  percentage: number
}
```

## Storage Structure

Files are stored in OPFS with the following structure:

```
/repos/
  {repo-name}/
    .repo-meta.json     # Repository metadata
    {files...}
```

## Testing

Run the test suite:
```
Open tests/unit/file-store.spec.html in a browser
```

Run the demo:
```
Open demo/index.html in a browser
```

## Dependencies

- OPFS Provider (core)
- Event Bus (core)

## Browser Support

- Chrome 86+
- Firefox 79+
- Safari 15.2+
- Edge 86+

Requires support for:
- Origin Private File System (OPFS)
- ES Modules
- fetch API

## License

MIT
