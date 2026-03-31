# ZeroCode Local Models

This built-in extension adds local-first language model providers for ZeroCode.

## Included providers

- `zerocode-ollama`
  Uses Ollama for model discovery and chat requests.
- `zerocode-openai-compatible`
  Uses any OpenAI-compatible endpoint, including LM Studio and self-hosted gateways.

## Commands

- `ZeroCode: Add Local Model Provider...`
- `ZeroCode: Add Ollama Provider`
- `ZeroCode: Add LM Studio Provider`
- `ZeroCode: Add OpenAI-Compatible Provider`
- `ZeroCode: Install Recommended Ollama Model...`
- `ZeroCode: Refresh Local Model Providers`
- `ZeroCode: Manage Chat Models`
- `ZeroCode: Open Local Chat`
- `ZeroCode: Open Local Model Setup Guide`

## What it does

- Registers local model vendors with the VS Code chat model system
- Discovers available models from the configured endpoint
- Streams chat responses through the built-in chat UI
- Supports per-model settings for temperature, top-p, and max output tokens
- Lets users refresh the provider list without restarting the app
- Falls back to a manually configured `models` list when discovery is unavailable
- Adds a built-in Getting Started walkthrough for local model setup
- Prompts for a custom endpoint when adding a generic OpenAI-compatible provider
- Supports a custom provider-group name and optional API key for generic OpenAI-compatible endpoints
- Can launch `ollama pull` for a recommended local model directly from the command palette

## Current scope

- Text streaming is supported
- Image input can be enabled per provider group
- Tool calling is intentionally disabled in this first pass
- Token counting currently uses a lightweight approximation

## Default endpoints

- Ollama: `http://127.0.0.1:11434/v1`
- LM Studio: `http://127.0.0.1:1234/v1`

## Notes

- Provider groups are stored in `chatLanguageModels.json`
- The provider uses the UI extension host so local endpoints remain reachable in remote-workspace scenarios
- If discovery fails, set the provider group's `models` value to a comma-separated list such as `qwen2.5-coder:7b,llama3.2:3b` and refresh providers
