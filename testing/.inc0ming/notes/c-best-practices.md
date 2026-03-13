# C++ Best Practices

## Memory Management

* Prefer smart pointers (`std::unique_ptr`, `std::shared_ptr`) over raw `new`/`delete`

* Use RAII (Resource Acquisition Is Initialization) to tie resource lifetimes to object scope

* Avoid `std::shared_ptr` when `std::unique_ptr` suffices — shared ownership has overhead from reference counting

* Use `std::make_unique` and `std::make_shared` instead of calling `new` directly

* Never return a raw owning pointer from a function — return a smart pointer or a value

## Modern C++ (C++17/20/23)

* Use `auto` for complex iterator types and lambda return types, but keep types explicit where clarity matters

* Prefer structured bindings: `auto [key, value] = *map.begin();`

* Use `std::optional` instead of sentinel values or output parameters

* Use `std::string_view` for read-only string parameters to avoid unnecessary copies

* Use `constexpr` for compile-time computation where possible

* Prefer `if constexpr` over SFINAE for compile-time branching

## Error Handling

* Use exceptions for truly exceptional conditions, not for normal control flow

* Prefer `std::expected` (C++23) or return codes for expected failure paths

* Never throw from destructors

* Catch exceptions by `const` reference: `catch (const std::exception& e)`

* Use `noexcept` on move constructors and destructors

## Const Correctness

* Mark member functions `const` if they don't modify object state

* Pass large objects by `const&` instead of by value

* Use `const` on local variables that don't change

* Prefer `constexpr` over `const` when the value is known at compile time

## STL and Containers

* Prefer `std::array` over C-style arrays for fixed-size collections

* Use `std::vector` as the default container — it's cache-friendly and resizable

* Reserve capacity with `vec.reserve(n)` when the size is known ahead of time

* Use `emplace_back` over `push_back` when constructing objects in-place

* Prefer range-based `for` loops: `for (const auto& item : container)`

* Use STL algorithms (`std::find`, `std::sort`, `std::transform`) over hand-written loops

## Object-Oriented Design

* Follow the Rule of Zero: if you don't manage resources directly, don't write special member functions

* If you must manage resources, follow the Rule of Five (destructor, copy/move constructor, copy/move assignment)

* Prefer composition over inheritance

* Use `override` on all virtual function overrides

* Mark classes `final` when they should not be subclassed

* Make destructors `virtual` in base classes intended for polymorphism

## Concurrency

* Prefer `std::jthread` (C++20) over `std::thread` for automatic joining

* Use `std::mutex` with `std::lock_guard` or `std::scoped_lock` — never call `lock()`/`unlock()` manually

* Use `std::atomic` for simple shared counters and flags

* Avoid sharing mutable state between threads when possible — prefer message passing

* Use `std::async` with `std::future` for simple parallel tasks

## Build and Tooling

* Enable high warning levels: `-Wall -Wextra -Wpedantic` (GCC/Clang) or `/W4` (MSVC)

* Treat warnings as errors in CI: `-Werror` or `/WX`

* Use AddressSanitizer (`-fsanitize=address`) and UndefinedBehaviorSanitizer (`-fsanitize=undefined`) during development

* Use a static analysis tool (clang-tidy, cppcheck) in your pipeline

* Prefer CMake as the build system for cross-platform projects

## Performance

* Measure before optimizing — use a profiler, not intuition

* Prefer move semantics over copies for expensive-to-copy types

* Avoid premature `std::move` — let copy elision (NRVO) work first

* Be aware of cache locality: prefer contiguous data (`std::vector`) over pointer-heavy structures (`std::list`)

* Use `std::string_view` and `std::span` to avoid unnecessary allocations when passing data