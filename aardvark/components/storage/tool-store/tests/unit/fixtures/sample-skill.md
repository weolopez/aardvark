---
name: count-lines
description: Count the number of lines in a file
allowed-tools: "read"
version: 1.0.0
author: Test Author
---

# Count Lines Tool

## Purpose
This tool counts the number of lines in a specified file.

## Usage
Call this tool with a file path to get the line count.

## Instructions

1. Read the file at the specified path using the read tool
2. Split the content by newlines
3. Count the resulting array length
4. Return the count as a JSON object

## Example

Input:
```json
{ "path": "src/main.rs" }
```

Output:
```json
{ "count": 42 }
```

## Error Handling

- If the file doesn't exist, return an error
- If the path is a directory, return an error
- If no path is provided, return an error
