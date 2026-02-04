// 01-hello-worker: Basic Rust WASM in a Web Worker
//
// This is the simplest possible example:
// - Rust function compiled to WASM
// - Loaded in a Web Worker
// - Called from main thread via postMessage

use wasm_bindgen::prelude::*;

// Log to browser console
fn log(message: &str) {
    web_sys::console::log_1(&JsValue::from_str(message));
}

/// Initialize the WASM module (sets up panic hook for better error messages)
#[wasm_bindgen]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
    log("Hello Worker WASM module initialized!");
}

/// Simple greeting function - takes a name, returns a greeting
#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    log(&format!("greet() called with: {}", name));
    format!(
        "Hello, {}! Greetings from Rust/WASM running in a Web Worker!",
        name
    )
}

/// Add two numbers (demonstrates basic computation)
#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    log(&format!("add({}, {}) called", a, b));
    a + b
}

/// Reverse a string (demonstrates string processing)
#[wasm_bindgen]
pub fn reverse_string(input: &str) -> String {
    log(&format!("reverse_string() called with: {}", input));
    input.chars().rev().collect()
}

/// Count words in a string
#[wasm_bindgen]
pub fn count_words(text: &str) -> usize {
    log(&format!("count_words() called"));
    text.split_whitespace().count()
}

/// Check if a number is prime
#[wasm_bindgen]
pub fn is_prime(n: u32) -> bool {
    log(&format!("is_prime({}) called", n));
    if n < 2 {
        return false;
    }
    for i in 2..=((n as f64).sqrt() as u32) {
        if n % i == 0 {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 3), 5);
        assert_eq!(add(-1, 1), 0);
    }

    #[test]
    fn test_reverse() {
        assert_eq!(reverse_string("hello"), "olleh");
        assert_eq!(reverse_string(""), "");
    }

    #[test]
    fn test_count_words() {
        assert_eq!(count_words("hello world"), 2);
        assert_eq!(count_words(""), 0);
    }

    #[test]
    fn test_is_prime() {
        assert!(!is_prime(0));
        assert!(!is_prime(1));
        assert!(is_prime(2));
        assert!(is_prime(17));
        assert!(!is_prime(18));
    }
}
