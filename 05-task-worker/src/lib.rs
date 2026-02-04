//! Task Management System for LLM Agents
//!
//! This module provides a persistent task management system designed for AI agents
//! running in the browser via WebAssembly. Inspired by Claude Code's task tools.
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────────┐
//! │   LLM Agent (JS)    │
//! │   or Rust Agent     │
//! └─────────┬───────────┘
//!           │ async calls
//!           ▼
//! ┌─────────────────────┐
//! │   Task Manager      │
//! │   (This Module)     │
//! │   - task_create()   │
//! │   - task_update()   │
//! │   - task_list()     │
//! │   - task_get()      │
//! └─────────┬───────────┘
//!           │
//!           ▼
//! ┌─────────────────────┐
//! │     IndexedDB       │
//! │  MyAgentTasksDB     │
//! │  ├─ tasks (store)   │
//! │  └─ index (store)   │
//! └─────────────────────┘
//! ```
//!
//! # Features
//!
//! - **Persistent Storage**: Tasks survive page reloads via IndexedDB
//! - **Dependency Management**: Tasks can block/unblock each other
//! - **Auto-unblocking**: Completing a task automatically unblocks dependents
//! - **Rich Metadata**: Custom JSON metadata for any task
//! - **Sub-agent Support**: Tasks can be assigned to sub-agents
//! - **Scheduling**: Cron-like schedule field for recurring tasks
//! - **Git Integration**: Reference commits/branches in metadata

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{IdbDatabase, IdbFactory, IdbOpenDbRequest, IdbRequest, IdbTransactionMode};
use std::cell::RefCell;

// ============================================================================
// Constants
// ============================================================================

const DB_NAME: &str = "MyAgentTasksDB";
const DB_VERSION: u32 = 1;
const STORE_TASKS: &str = "tasks";
const STORE_INDEX: &str = "index";
const INDEX_KEY: &str = "taskIndex";

// ============================================================================
// Task Types
// ============================================================================

/// Task status enum
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Blocked,
    Completed,
}

impl Default for TaskStatus {
    fn default() -> Self {
        TaskStatus::Pending
    }
}

impl std::fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskStatus::Pending => write!(f, "pending"),
            TaskStatus::InProgress => write!(f, "in_progress"),
            TaskStatus::Blocked => write!(f, "blocked"),
            TaskStatus::Completed => write!(f, "completed"),
        }
    }
}

/// Main task structure
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Task {
    /// Unique identifier (timestamp-based)
    pub id: String,
    
    /// Short subject/title
    pub subject: String,
    
    /// Detailed description
    pub description: String,
    
    /// Current status
    pub status: TaskStatus,
    
    /// Creation timestamp (ms since epoch)
    pub created_at: f64,
    
    /// Last update timestamp
    pub updated_at: f64,
    
    /// IDs of tasks that block this one
    #[serde(default)]
    pub blocked_by: Vec<String>,
    
    /// IDs of tasks that this one blocks
    #[serde(default)]
    pub blocks: Vec<String>,
    
    /// Optional owner/assignee
    #[serde(default)]
    pub owner: Option<String>,
    
    /// Optional sub-agent type for orchestration
    #[serde(default)]
    pub sub_agent: Option<String>,
    
    /// Optional cron-like schedule string
    #[serde(default)]
    pub schedule: Option<String>,
    
    /// Custom metadata (any JSON)
    #[serde(default)]
    pub metadata: Option<serde_json::Value>,
}

/// Task summary for the index
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TaskSummary {
    pub id: String,
    pub subject: String,
    pub status: TaskStatus,
    pub created_at: f64,
    pub blocker_count: usize,
    #[serde(default)]
    pub owner: Option<String>,
    #[serde(default)]
    pub sub_agent: Option<String>,
}

impl From<&Task> for TaskSummary {
    fn from(task: &Task) -> Self {
        TaskSummary {
            id: task.id.clone(),
            subject: task.subject.clone(),
            status: task.status.clone(),
            created_at: task.created_at,
            blocker_count: task.blocked_by.len(),
            owner: task.owner.clone(),
            sub_agent: task.sub_agent.clone(),
        }
    }
}

/// Index structure stored in IndexedDB
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct TaskIndex {
    pub tasks: Vec<TaskSummary>,
    pub last_updated: f64,
}

/// Update request structure
#[derive(Serialize, Deserialize, Debug, Default)]
pub struct TaskUpdate {
    #[serde(default)]
    pub subject: Option<String>,
    
    #[serde(default)]
    pub description: Option<String>,
    
    #[serde(default)]
    pub status: Option<String>,
    
    #[serde(default)]
    pub owner: Option<String>,
    
    #[serde(default)]
    pub sub_agent: Option<String>,
    
    #[serde(default)]
    pub schedule: Option<String>,
    
    #[serde(default)]
    pub metadata: Option<serde_json::Value>,
    
    /// Task IDs to add as blockers
    #[serde(default)]
    pub add_blocked_by: Option<Vec<String>>,
    
    /// Task IDs to remove as blockers
    #[serde(default)]
    pub remove_blocked_by: Option<Vec<String>>,
}

/// Filter for listing tasks
#[derive(Serialize, Deserialize, Debug, Default)]
pub struct TaskFilter {
    #[serde(default)]
    pub status: Option<String>,
    
    #[serde(default)]
    pub owner: Option<String>,
    
    #[serde(default)]
    pub sub_agent: Option<String>,
    
    /// If true, only show tasks with no blockers
    #[serde(default)]
    pub ready_only: Option<bool>,
}

/// API response wrapper
#[derive(Serialize, Deserialize, Debug)]
pub struct TaskResult<T> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl<T> TaskResult<T> {
    pub fn ok(data: T) -> Self {
        TaskResult {
            success: true,
            data: Some(data),
            error: None,
        }
    }
    
    pub fn err(message: &str) -> Self {
        TaskResult {
            success: false,
            data: None,
            error: Some(message.to_string()),
        }
    }
}

// ============================================================================
// Database Connection Cache
// ============================================================================

thread_local! {
    static DB_CACHE: RefCell<Option<IdbDatabase>> = RefCell::new(None);
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Log to browser console
fn log(message: &str) {
    web_sys::console::log_1(&JsValue::from_str(message));
}

/// Get current timestamp in milliseconds
fn now() -> f64 {
    js_sys::Date::now()
}

/// Generate a unique task ID
fn generate_id() -> String {
    let timestamp = now() as u64;
    let random: u32 = (js_sys::Math::random() * 1_000_000.0) as u32;
    format!("task_{:013}_{:06}", timestamp, random)
}

/// Get IndexedDB factory from global scope (works in both Window and Worker)
fn get_idb_factory() -> Result<IdbFactory, String> {
    let global = js_sys::global();
    let idb = js_sys::Reflect::get(&global, &JsValue::from_str("indexedDB"))
        .map_err(|_| "Failed to get indexedDB from global scope".to_string())?;
    idb.dyn_into::<IdbFactory>()
        .map_err(|_| "indexedDB is not available".to_string())
}

/// Check if DomStringList contains a value
fn has_store(list: &web_sys::DomStringList, name: &str) -> bool {
    for i in 0..list.length() {
        if let Some(item) = list.get(i) {
            if item == name {
                return true;
            }
        }
    }
    false
}

/// Convert IdbRequest to Future and get result
async fn request_to_future(request: &IdbRequest) -> Result<JsValue, String> {
    let promise = js_sys::Promise::new(&mut |resolve, reject| {
        let resolve_clone = resolve.clone();
        let reject_clone = reject.clone();
        
        let onsuccess = Closure::once(Box::new(move |_: web_sys::Event| {
            resolve_clone.call0(&JsValue::NULL).unwrap();
        }));
        
        let onerror = Closure::once(Box::new(move |_: web_sys::Event| {
            reject_clone.call0(&JsValue::NULL).unwrap();
        }));
        
        request.set_onsuccess(Some(onsuccess.as_ref().unchecked_ref()));
        request.set_onerror(Some(onerror.as_ref().unchecked_ref()));
        
        onsuccess.forget();
        onerror.forget();
    });
    
    JsFuture::from(promise)
        .await
        .map_err(|e| format!("Request failed: {:?}", e))?;
    
    request.result().map_err(|e| format!("Failed to get result: {:?}", e))
}

/// Open the database (with caching)
async fn open_database() -> Result<IdbDatabase, String> {
    // Check cache first
    let cached = DB_CACHE.with(|cache| cache.borrow().clone());
    if let Some(db) = cached {
        return Ok(db);
    }
    
    let factory = get_idb_factory()?;
    
    let open_request: IdbOpenDbRequest = factory
        .open_with_u32(DB_NAME, DB_VERSION)
        .map_err(|e| format!("Failed to open database: {:?}", e))?;
    
    // Set up upgrade handler to create stores
    let onupgradeneeded = Closure::once(Box::new(move |event: web_sys::IdbVersionChangeEvent| {
        log(&format!("Upgrading database to version {}", DB_VERSION));
        
        let request: IdbOpenDbRequest = event.target()
            .unwrap()
            .dyn_into()
            .unwrap();
        let db: IdbDatabase = request.result().unwrap().dyn_into().unwrap();
        
        // Create 'tasks' store if needed
        if !has_store(&db.object_store_names(), STORE_TASKS) {
            db.create_object_store(STORE_TASKS)
                .expect("Failed to create tasks store");
            log("Created 'tasks' object store");
        }
        
        // Create 'index' store if needed
        if !has_store(&db.object_store_names(), STORE_INDEX) {
            db.create_object_store(STORE_INDEX)
                .expect("Failed to create index store");
            log("Created 'index' object store");
        }
    }));
    
    open_request.set_onupgradeneeded(Some(onupgradeneeded.as_ref().unchecked_ref()));
    onupgradeneeded.forget();
    
    // Wait for open to complete
    let promise = js_sys::Promise::new(&mut |resolve, reject| {
        let resolve_clone = resolve.clone();
        let reject_clone = reject.clone();
        
        let onsuccess = Closure::once(Box::new(move |_: web_sys::Event| {
            resolve_clone.call0(&JsValue::NULL).unwrap();
        }));
        
        let onerror = Closure::once(Box::new(move |_: web_sys::Event| {
            reject_clone.call0(&JsValue::NULL).unwrap();
        }));
        
        let onblocked = Closure::once(Box::new(move |_: web_sys::Event| {
            log("Database upgrade blocked - close other tabs");
        }));
        
        open_request.set_onsuccess(Some(onsuccess.as_ref().unchecked_ref()));
        open_request.set_onerror(Some(onerror.as_ref().unchecked_ref()));
        open_request.set_onblocked(Some(onblocked.as_ref().unchecked_ref()));
        
        onsuccess.forget();
        onerror.forget();
        onblocked.forget();
    });
    
    JsFuture::from(promise)
        .await
        .map_err(|e| format!("Failed to open database: {:?}", e))?;
    
    let db: IdbDatabase = open_request
        .result()
        .map_err(|e| format!("Failed to get database: {:?}", e))?
        .dyn_into()
        .map_err(|_| "Result is not an IdbDatabase")?;
    
    // Cache the connection
    DB_CACHE.with(|cache| {
        *cache.borrow_mut() = Some(db.clone());
    });
    
    log(&format!("Opened database: {}", DB_NAME));
    Ok(db)
}

/// Get a task by ID from the database
async fn get_task_by_id(db: &IdbDatabase, task_id: &str) -> Result<Option<Task>, String> {
    let tx = db
        .transaction_with_str_and_mode(STORE_TASKS, IdbTransactionMode::Readonly)
        .map_err(|e| format!("Failed to create transaction: {:?}", e))?;
    
    let store = tx
        .object_store(STORE_TASKS)
        .map_err(|e| format!("Failed to get store: {:?}", e))?;
    
    let request = store
        .get(&JsValue::from_str(task_id))
        .map_err(|e| format!("Failed to get task: {:?}", e))?;
    
    let result = request_to_future(&request).await?;
    
    if result.is_undefined() || result.is_null() {
        return Ok(None);
    }
    
    let task: Task = serde_wasm_bindgen::from_value(result)
        .map_err(|e| format!("Failed to deserialize task: {:?}", e))?;
    
    Ok(Some(task))
}

/// Save a task to the database
async fn save_task(db: &IdbDatabase, task: &Task) -> Result<(), String> {
    let tx = db
        .transaction_with_str_and_mode(STORE_TASKS, IdbTransactionMode::Readwrite)
        .map_err(|e| format!("Failed to create transaction: {:?}", e))?;
    
    let store = tx
        .object_store(STORE_TASKS)
        .map_err(|e| format!("Failed to get store: {:?}", e))?;
    
    let js_value = serde_wasm_bindgen::to_value(task)
        .map_err(|e| format!("Failed to serialize task: {:?}", e))?;
    
    let request = store
        .put_with_key(&js_value, &JsValue::from_str(&task.id))
        .map_err(|e| format!("Failed to put task: {:?}", e))?;
    
    request_to_future(&request).await?;
    Ok(())
}

/// Delete a task from the database
async fn delete_task(db: &IdbDatabase, task_id: &str) -> Result<(), String> {
    let tx = db
        .transaction_with_str_and_mode(STORE_TASKS, IdbTransactionMode::Readwrite)
        .map_err(|e| format!("Failed to create transaction: {:?}", e))?;
    
    let store = tx
        .object_store(STORE_TASKS)
        .map_err(|e| format!("Failed to get store: {:?}", e))?;
    
    let request = store
        .delete(&JsValue::from_str(task_id))
        .map_err(|e| format!("Failed to delete task: {:?}", e))?;
    
    request_to_future(&request).await?;
    Ok(())
}

/// Get the task index
async fn get_index(db: &IdbDatabase) -> Result<TaskIndex, String> {
    let tx = db
        .transaction_with_str_and_mode(STORE_INDEX, IdbTransactionMode::Readonly)
        .map_err(|e| format!("Failed to create transaction: {:?}", e))?;
    
    let store = tx
        .object_store(STORE_INDEX)
        .map_err(|e| format!("Failed to get store: {:?}", e))?;
    
    let request = store
        .get(&JsValue::from_str(INDEX_KEY))
        .map_err(|e| format!("Failed to get index: {:?}", e))?;
    
    let result = request_to_future(&request).await?;
    
    if result.is_undefined() || result.is_null() {
        return Ok(TaskIndex::default());
    }
    
    let index: TaskIndex = serde_wasm_bindgen::from_value(result)
        .map_err(|e| format!("Failed to deserialize index: {:?}", e))?;
    
    Ok(index)
}

/// Save the task index
async fn save_index(db: &IdbDatabase, index: &TaskIndex) -> Result<(), String> {
    let tx = db
        .transaction_with_str_and_mode(STORE_INDEX, IdbTransactionMode::Readwrite)
        .map_err(|e| format!("Failed to create transaction: {:?}", e))?;
    
    let store = tx
        .object_store(STORE_INDEX)
        .map_err(|e| format!("Failed to get store: {:?}", e))?;
    
    let js_value = serde_wasm_bindgen::to_value(index)
        .map_err(|e| format!("Failed to serialize index: {:?}", e))?;
    
    let request = store
        .put_with_key(&js_value, &JsValue::from_str(INDEX_KEY))
        .map_err(|e| format!("Failed to put index: {:?}", e))?;
    
    request_to_future(&request).await?;
    Ok(())
}

/// Update the index with a task (add or update)
async fn update_index_for_task(db: &IdbDatabase, task: &Task) -> Result<(), String> {
    let mut index = get_index(db).await?;
    
    // Remove existing entry if present
    index.tasks.retain(|t| t.id != task.id);
    
    // Add new summary
    index.tasks.push(TaskSummary::from(task));
    index.last_updated = now();
    
    // Sort by created_at descending
    index.tasks.sort_by(|a, b| b.created_at.partial_cmp(&a.created_at).unwrap());
    
    save_index(db, &index).await
}

/// Remove a task from the index
async fn remove_from_index(db: &IdbDatabase, task_id: &str) -> Result<(), String> {
    let mut index = get_index(db).await?;
    index.tasks.retain(|t| t.id != task_id);
    index.last_updated = now();
    save_index(db, &index).await
}

/// Parse status string to enum
fn parse_status(status_str: &str) -> Result<TaskStatus, String> {
    match status_str.to_lowercase().as_str() {
        "pending" => Ok(TaskStatus::Pending),
        "in_progress" | "inprogress" => Ok(TaskStatus::InProgress),
        "blocked" => Ok(TaskStatus::Blocked),
        "completed" | "done" => Ok(TaskStatus::Completed),
        _ => Err(format!("Invalid status: {}", status_str)),
    }
}

// ============================================================================
// Public API - WASM Exports
// ============================================================================

/// Initialize the WASM module
#[wasm_bindgen]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
    log("Task Manager WASM module initialized");
}

/// Create a new task
///
/// # Arguments
/// * `subject` - Short task title
/// * `description` - Detailed description
/// * `metadata` - Optional JSON metadata
///
/// # Returns
/// JSON object with the created task
#[wasm_bindgen]
pub async fn task_create(
    subject: String,
    description: String,
    metadata: JsValue,
) -> JsValue {
    let result = task_create_internal(subject, description, metadata).await;
    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

async fn task_create_internal(
    subject: String,
    description: String,
    metadata: JsValue,
) -> TaskResult<Task> {
    // Validate inputs
    if subject.trim().is_empty() {
        return TaskResult::err("Subject cannot be empty");
    }
    
    let db = match open_database().await {
        Ok(db) => db,
        Err(e) => return TaskResult::err(&e),
    };
    
    let timestamp = now();
    
    // Parse metadata if provided
    let meta: Option<serde_json::Value> = if metadata.is_undefined() || metadata.is_null() {
        None
    } else {
        serde_wasm_bindgen::from_value(metadata).ok()
    };
    
    let task = Task {
        id: generate_id(),
        subject,
        description,
        status: TaskStatus::Pending,
        created_at: timestamp,
        updated_at: timestamp,
        blocked_by: Vec::new(),
        blocks: Vec::new(),
        owner: None,
        sub_agent: None,
        schedule: None,
        metadata: meta,
    };
    
    // Save task
    if let Err(e) = save_task(&db, &task).await {
        return TaskResult::err(&e);
    }
    
    // Update index
    if let Err(e) = update_index_for_task(&db, &task).await {
        return TaskResult::err(&e);
    }
    
    log(&format!("Created task: {} - {}", task.id, task.subject));
    TaskResult::ok(task)
}

/// Update an existing task
///
/// # Arguments
/// * `task_id` - ID of the task to update
/// * `updates` - JSON object with fields to update
///
/// # Returns
/// JSON object with the updated task
#[wasm_bindgen]
pub async fn task_update(task_id: String, updates: JsValue) -> JsValue {
    let result = task_update_internal(task_id, updates).await;
    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

async fn task_update_internal(task_id: String, updates: JsValue) -> TaskResult<Task> {
    let db = match open_database().await {
        Ok(db) => db,
        Err(e) => return TaskResult::err(&e),
    };
    
    // Get existing task
    let mut task = match get_task_by_id(&db, &task_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return TaskResult::err(&format!("Task not found: {}", task_id)),
        Err(e) => return TaskResult::err(&e),
    };
    
    // Parse updates
    let update: TaskUpdate = match serde_wasm_bindgen::from_value(updates) {
        Ok(u) => u,
        Err(e) => return TaskResult::err(&format!("Invalid update format: {:?}", e)),
    };
    
    let was_completed = task.status == TaskStatus::Completed;
    
    // Apply updates
    if let Some(subject) = update.subject {
        task.subject = subject;
    }
    if let Some(description) = update.description {
        task.description = description;
    }
    if let Some(status_str) = update.status {
        match parse_status(&status_str) {
            Ok(status) => task.status = status,
            Err(e) => return TaskResult::err(&e),
        }
    }
    if let Some(owner) = update.owner {
        task.owner = Some(owner);
    }
    if let Some(sub_agent) = update.sub_agent {
        task.sub_agent = Some(sub_agent);
    }
    if let Some(schedule) = update.schedule {
        task.schedule = Some(schedule);
    }
    if let Some(metadata) = update.metadata {
        task.metadata = Some(metadata);
    }
    
    // Handle adding blockers
    if let Some(add_blockers) = update.add_blocked_by {
        for blocker_id in add_blockers {
            if !task.blocked_by.contains(&blocker_id) {
                task.blocked_by.push(blocker_id.clone());
                
                // Update the blocking task's 'blocks' field
                if let Ok(Some(mut blocker)) = get_task_by_id(&db, &blocker_id).await {
                    if !blocker.blocks.contains(&task.id) {
                        blocker.blocks.push(task.id.clone());
                        blocker.updated_at = now();
                        let _ = save_task(&db, &blocker).await;
                        let _ = update_index_for_task(&db, &blocker).await;
                    }
                }
            }
        }
        
        // Set status to Blocked if we have blockers
        if !task.blocked_by.is_empty() && task.status == TaskStatus::Pending {
            task.status = TaskStatus::Blocked;
        }
    }
    
    // Handle removing blockers
    if let Some(remove_blockers) = update.remove_blocked_by {
        for blocker_id in remove_blockers {
            task.blocked_by.retain(|id| id != &blocker_id);
            
            // Update the blocking task's 'blocks' field
            if let Ok(Some(mut blocker)) = get_task_by_id(&db, &blocker_id).await {
                blocker.blocks.retain(|id| id != &task.id);
                blocker.updated_at = now();
                let _ = save_task(&db, &blocker).await;
                let _ = update_index_for_task(&db, &blocker).await;
            }
        }
        
        // Unblock if no more blockers and currently blocked
        if task.blocked_by.is_empty() && task.status == TaskStatus::Blocked {
            task.status = TaskStatus::Pending;
        }
    }
    
    task.updated_at = now();
    
    // Save updated task
    if let Err(e) = save_task(&db, &task).await {
        return TaskResult::err(&e);
    }
    
    // Update index
    if let Err(e) = update_index_for_task(&db, &task).await {
        return TaskResult::err(&e);
    }
    
    // Handle completion - unblock dependent tasks
    if !was_completed && task.status == TaskStatus::Completed {
        log(&format!("Task completed, unblocking {} dependents", task.blocks.len()));
        
        for dependent_id in &task.blocks {
            if let Ok(Some(mut dependent)) = get_task_by_id(&db, dependent_id).await {
                // Remove this task from dependent's blocked_by
                dependent.blocked_by.retain(|id| id != &task.id);
                dependent.updated_at = now();
                
                // If no more blockers and was blocked, set to pending
                if dependent.blocked_by.is_empty() && dependent.status == TaskStatus::Blocked {
                    dependent.status = TaskStatus::Pending;
                    log(&format!("Unblocked task: {}", dependent.id));
                }
                
                let _ = save_task(&db, &dependent).await;
                let _ = update_index_for_task(&db, &dependent).await;
            }
        }
    }
    
    log(&format!("Updated task: {} - {}", task.id, task.subject));
    TaskResult::ok(task)
}

/// List tasks with optional filtering
///
/// # Arguments
/// * `filter` - Optional JSON filter object
///
/// # Returns
/// JSON array of task summaries
#[wasm_bindgen]
pub async fn task_list(filter: JsValue) -> JsValue {
    let result = task_list_internal(filter).await;
    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

async fn task_list_internal(filter: JsValue) -> TaskResult<Vec<TaskSummary>> {
    let db = match open_database().await {
        Ok(db) => db,
        Err(e) => return TaskResult::err(&e),
    };
    
    let index = match get_index(&db).await {
        Ok(idx) => idx,
        Err(e) => return TaskResult::err(&e),
    };
    
    // Parse filter
    let task_filter: TaskFilter = if filter.is_undefined() || filter.is_null() {
        TaskFilter::default()
    } else {
        serde_wasm_bindgen::from_value(filter).unwrap_or_default()
    };
    
    // Apply filters
    let tasks: Vec<TaskSummary> = index.tasks.into_iter().filter(|t| {
        // Status filter
        if let Some(ref status) = task_filter.status {
            let status_lower: String = status.to_lowercase();
            if t.status.to_string() != status_lower {
                return false;
            }
        }
        
        // Owner filter
        if let Some(ref owner) = task_filter.owner {
            if t.owner.as_ref() != Some(owner) {
                return false;
            }
        }
        
        // Sub-agent filter
        if let Some(ref sub_agent) = task_filter.sub_agent {
            if t.sub_agent.as_ref() != Some(sub_agent) {
                return false;
            }
        }
        
        // Ready-only filter (pending with no blockers)
        if task_filter.ready_only == Some(true) {
            if t.status != TaskStatus::Pending || t.blocker_count > 0 {
                return false;
            }
        }
        
        true
    }).collect();
    
    // Already sorted by created_at descending in index
    log(&format!("Listed {} tasks", tasks.len()));
    TaskResult::ok(tasks)
}

/// Get full details of a single task
///
/// # Arguments
/// * `task_id` - ID of the task
///
/// # Returns
/// JSON object with full task details
#[wasm_bindgen]
pub async fn task_get(task_id: String) -> JsValue {
    let result = task_get_internal(task_id).await;
    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

async fn task_get_internal(task_id: String) -> TaskResult<Task> {
    let db = match open_database().await {
        Ok(db) => db,
        Err(e) => return TaskResult::err(&e),
    };
    
    match get_task_by_id(&db, &task_id).await {
        Ok(Some(task)) => TaskResult::ok(task),
        Ok(None) => TaskResult::err(&format!("Task not found: {}", task_id)),
        Err(e) => TaskResult::err(&e),
    }
}

/// Delete a task
///
/// # Arguments
/// * `task_id` - ID of the task to delete
///
/// # Returns
/// JSON object with success status
#[wasm_bindgen]
pub async fn task_delete(task_id: String) -> JsValue {
    let result = task_delete_internal(task_id).await;
    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

async fn task_delete_internal(task_id: String) -> TaskResult<()> {
    let db = match open_database().await {
        Ok(db) => db,
        Err(e) => return TaskResult::err(&e),
    };
    
    // Get task to check dependencies
    let task = match get_task_by_id(&db, &task_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return TaskResult::err(&format!("Task not found: {}", task_id)),
        Err(e) => return TaskResult::err(&e),
    };
    
    // Remove this task from any tasks it blocks
    for blocked_id in &task.blocks {
        if let Ok(Some(mut blocked)) = get_task_by_id(&db, blocked_id).await {
            blocked.blocked_by.retain(|id| id != &task_id);
            blocked.updated_at = now();
            
            // Unblock if no more blockers
            if blocked.blocked_by.is_empty() && blocked.status == TaskStatus::Blocked {
                blocked.status = TaskStatus::Pending;
            }
            
            let _ = save_task(&db, &blocked).await;
            let _ = update_index_for_task(&db, &blocked).await;
        }
    }
    
    // Remove this task from any tasks that block it
    for blocker_id in &task.blocked_by {
        if let Ok(Some(mut blocker)) = get_task_by_id(&db, blocker_id).await {
            blocker.blocks.retain(|id| id != &task_id);
            blocker.updated_at = now();
            let _ = save_task(&db, &blocker).await;
            let _ = update_index_for_task(&db, &blocker).await;
        }
    }
    
    // Delete the task
    if let Err(e) = delete_task(&db, &task_id).await {
        return TaskResult::err(&e);
    }
    
    // Remove from index
    if let Err(e) = remove_from_index(&db, &task_id).await {
        return TaskResult::err(&e);
    }
    
    log(&format!("Deleted task: {}", task_id));
    TaskResult::ok(())
}

/// Import tasks from markdown text (e.g., tasks.md)
///
/// Format expected:
/// ```markdown
/// ## Task Subject
/// Description text here
/// - status: pending
/// - owner: agent-1
/// ```
#[wasm_bindgen]
pub async fn task_hydrate(markdown: String) -> JsValue {
    let result = task_hydrate_internal(markdown).await;
    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

async fn task_hydrate_internal(markdown: String) -> TaskResult<Vec<Task>> {
    let db = match open_database().await {
        Ok(db) => db,
        Err(e) => return TaskResult::err(&e),
    };
    
    let mut tasks = Vec::new();
    let mut current_subject: Option<String> = None;
    let mut current_description = String::new();
    let mut current_status = TaskStatus::Pending;
    let mut current_owner: Option<String> = None;
    
    for line in markdown.lines() {
        let line = line.trim();
        
        // New task header
        if line.starts_with("## ") {
            // Save previous task if any
            if let Some(subject) = current_subject.take() {
                let timestamp = now();
                let task = Task {
                    id: generate_id(),
                    subject,
                    description: current_description.trim().to_string(),
                    status: current_status.clone(),
                    created_at: timestamp,
                    updated_at: timestamp,
                    blocked_by: Vec::new(),
                    blocks: Vec::new(),
                    owner: current_owner.take(),
                    sub_agent: None,
                    schedule: None,
                    metadata: None,
                };
                
                if let Err(e) = save_task(&db, &task).await {
                    return TaskResult::err(&e);
                }
                if let Err(e) = update_index_for_task(&db, &task).await {
                    return TaskResult::err(&e);
                }
                
                tasks.push(task);
            }
            
            // Start new task
            current_subject = Some(line[3..].trim().to_string());
            current_description = String::new();
            current_status = TaskStatus::Pending;
            current_owner = None;
        }
        // Metadata line
        else if line.starts_with("- status:") {
            let status_str = line[9..].trim();
            current_status = parse_status(status_str).unwrap_or(TaskStatus::Pending);
        }
        else if line.starts_with("- owner:") {
            current_owner = Some(line[8..].trim().to_string());
        }
        // Description line
        else if current_subject.is_some() && !line.is_empty() && !line.starts_with("-") {
            if !current_description.is_empty() {
                current_description.push('\n');
            }
            current_description.push_str(line);
        }
    }
    
    // Save last task
    if let Some(subject) = current_subject {
        let timestamp = now();
        let task = Task {
            id: generate_id(),
            subject,
            description: current_description.trim().to_string(),
            status: current_status,
            created_at: timestamp,
            updated_at: timestamp,
            blocked_by: Vec::new(),
            blocks: Vec::new(),
            owner: current_owner,
            sub_agent: None,
            schedule: None,
            metadata: None,
        };
        
        if let Err(e) = save_task(&db, &task).await {
            return TaskResult::err(&e);
        }
        if let Err(e) = update_index_for_task(&db, &task).await {
            return TaskResult::err(&e);
        }
        
        tasks.push(task);
    }
    
    log(&format!("Hydrated {} tasks from markdown", tasks.len()));
    TaskResult::ok(tasks)
}

/// Get database statistics
#[wasm_bindgen]
pub async fn task_stats() -> JsValue {
    let result = task_stats_internal().await;
    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

#[derive(Serialize)]
struct TaskStats {
    total: usize,
    pending: usize,
    in_progress: usize,
    blocked: usize,
    completed: usize,
    ready: usize, // pending with no blockers
}

async fn task_stats_internal() -> TaskResult<TaskStats> {
    let db = match open_database().await {
        Ok(db) => db,
        Err(e) => return TaskResult::err(&e),
    };
    
    let index = match get_index(&db).await {
        Ok(idx) => idx,
        Err(e) => return TaskResult::err(&e),
    };
    
    let mut stats = TaskStats {
        total: index.tasks.len(),
        pending: 0,
        in_progress: 0,
        blocked: 0,
        completed: 0,
        ready: 0,
    };
    
    for task in &index.tasks {
        match task.status {
            TaskStatus::Pending => {
                stats.pending += 1;
                if task.blocker_count == 0 {
                    stats.ready += 1;
                }
            }
            TaskStatus::InProgress => stats.in_progress += 1,
            TaskStatus::Blocked => stats.blocked += 1,
            TaskStatus::Completed => stats.completed += 1,
        }
    }
    
    TaskResult::ok(stats)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_generate_id() {
        let id1 = generate_id();
        let id2 = generate_id();
        assert!(id1.starts_with("task_"));
        assert_ne!(id1, id2);
    }
    
    #[test]
    fn test_parse_status() {
        assert_eq!(parse_status("pending").unwrap(), TaskStatus::Pending);
        assert_eq!(parse_status("PENDING").unwrap(), TaskStatus::Pending);
        assert_eq!(parse_status("in_progress").unwrap(), TaskStatus::InProgress);
        assert_eq!(parse_status("completed").unwrap(), TaskStatus::Completed);
        assert!(parse_status("invalid").is_err());
    }
    
    #[test]
    fn test_task_summary_from_task() {
        let task = Task {
            id: "test_id".to_string(),
            subject: "Test Task".to_string(),
            description: "Description".to_string(),
            status: TaskStatus::Pending,
            created_at: 1000.0,
            updated_at: 1000.0,
            blocked_by: vec!["other_id".to_string()],
            blocks: Vec::new(),
            owner: Some("alice".to_string()),
            sub_agent: None,
            schedule: None,
            metadata: None,
        };
        
        let summary = TaskSummary::from(&task);
        assert_eq!(summary.id, "test_id");
        assert_eq!(summary.subject, "Test Task");
        assert_eq!(summary.blocker_count, 1);
        assert_eq!(summary.owner, Some("alice".to_string()));
    }
}
