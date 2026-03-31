/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export const ZEROCODE_OLLAMA_VENDOR = 'zerocode-ollama';
export const ZEROCODE_OPENAI_COMPAT_VENDOR = 'zerocode-openai-compatible';

type VendorId = typeof ZEROCODE_OLLAMA_VENDOR | typeof ZEROCODE_OPENAI_COMPAT_VENDOR;

interface ProviderConfiguration {
	label?: string;
	endpoint?: string;
	apiKey?: string;
	requestTimeout?: number;
	models?: string;
	maxInputTokens?: number;
	maxOutputTokens?: number;
	imageInput?: boolean;
	defaultForChat?: boolean;
}

interface ModelConfiguration {
	temperature?: number;
	topP?: number;
	maxTokens?: number;
}

interface ZeroCodeLanguageModelInformation extends vscode.LanguageModelChatInformation {
	readonly endpoint: string;
	readonly apiKey?: string;
	readonly requestTimeout: number;
	readonly imageInputEnabled: boolean;
}

interface ListedModel {
	readonly id: string;
	readonly name: string;
	readonly family: string;
	readonly version: string;
	readonly detail?: string;
	readonly tooltip?: string;
}

interface OpenAIListResponse {
	readonly data?: Array<{
		readonly id: string;
		readonly created?: number;
		readonly owned_by?: string;
	}>;
	readonly models?: Array<{
		readonly id: string;
		readonly created?: number;
		readonly owned_by?: string;
	}>;
}

interface OllamaListResponse {
	readonly models?: Array<{
		readonly name?: string;
		readonly model?: string;
		readonly details?: {
			readonly family?: string;
			readonly parameter_size?: string;
			readonly format?: string;
		};
	}>;
}

interface OpenAIChatCompletionResponse {
	readonly choices?: Array<{
		readonly message?: {
			readonly content?: string;
		};
	}>;
}

interface OpenAIStreamChunk {
	readonly choices?: Array<{
		readonly delta?: {
			readonly content?: string;
		};
		readonly message?: {
			readonly content?: string;
		};
	}>;
}

interface OpenAIChatCompletionMessage {
	readonly role: 'system' | 'user' | 'assistant';
	readonly content: string | OpenAIChatCompletionContentPart[];
	readonly name?: string;
}

interface OpenAIChatCompletionContentPart {
	readonly type: 'text' | 'image_url';
	readonly text?: string;
	readonly image_url?: {
		readonly url: string;
	};
}

function stripTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}

function normalizeEndpoint(value: string | undefined, fallback: string): string {
	const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
	return stripTrailingSlash(raw);
}

function deriveFamily(modelId: string): string {
	if (modelId.includes(':')) {
		return modelId.split(':', 2)[0];
	}
	return modelId;
}

function deriveVersion(modelId: string): string {
	if (modelId.includes(':')) {
		return modelId.split(':', 2)[1] || 'latest';
	}
	return 'latest';
}

function parseConfiguredModels(value: string | undefined): ListedModel[] {
	if (!value) {
		return [];
	}

	return value
		.split(/[,\r\n]+/)
		.map(item => item.trim())
		.filter(Boolean)
		.map(modelId => ({
			id: modelId,
			name: modelId,
			family: deriveFamily(modelId),
			version: deriveVersion(modelId),
		}));
}

function mergeListedModels(primary: ListedModel[], fallback: ListedModel[]): ListedModel[] {
	const result = new Map<string, ListedModel>();
	for (const model of primary) {
		result.set(model.id, model);
	}
	for (const model of fallback) {
		if (!result.has(model.id)) {
			result.set(model.id, model);
		}
	}
	return [...result.values()];
}

function approximateTokenCount(value: string): number {
	return Math.max(1, Math.ceil(value.length / 4));
}

function isImageMimeType(mimeType: string): boolean {
	return mimeType.startsWith('image/');
}

function buildAuthHeaders(apiKey: string | undefined): HeadersInit {
	if (!apiKey) {
		return {};
	}
	return {
		Authorization: `Bearer ${apiKey}`
	};
}

async function fetchJson<T>(
	url: string,
	init: RequestInit,
	timeoutMs: number,
	token: vscode.CancellationToken,
): Promise<T> {
	const response = await fetchWithTimeout(url, init, timeoutMs, token);
	const text = await response.text();
	if (!response.ok) {
		throw new Error(`Request to ${url} failed with ${response.status}: ${text || response.statusText}`);
	}

	try {
		return JSON.parse(text) as T;
	} catch (error) {
		throw new Error(`Failed to parse JSON from ${url}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

async function fetchWithTimeout(
	url: string,
	init: RequestInit,
	timeoutMs: number,
	token: vscode.CancellationToken,
): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
	const cancellation = token.onCancellationRequested(() => controller.abort(new Error('Request cancelled')));

	try {
		return await fetch(url, {
			...init,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeout);
		cancellation.dispose();
	}
}

function stringifyToolResultContent(parts: readonly unknown[]): string {
	return parts.map(part => {
		if (part instanceof vscode.LanguageModelTextPart) {
			return part.value;
		}
		if (part instanceof vscode.LanguageModelDataPart) {
			return `[data:${part.mimeType}]`;
		}
		if (part instanceof vscode.LanguageModelToolCallPart) {
			return `Tool call ${part.name}: ${JSON.stringify(part.input)}`;
		}
		if (part instanceof vscode.LanguageModelToolResultPart) {
			return stringifyToolResultContent(part.content);
		}
		try {
			return JSON.stringify(part);
		} catch {
			return String(part);
		}
	}).join('\n');
}

function toOpenAIMessage(
	message: vscode.LanguageModelChatRequestMessage,
	imageInputEnabled: boolean,
): OpenAIChatCompletionMessage {
	const role =
		message.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' :
			message.role === vscode.LanguageModelChatMessageRole.System ? 'system' :
				'user';

	const contentParts: OpenAIChatCompletionContentPart[] = [];
	let plainText = '';

	for (const part of message.content) {
		if (part instanceof vscode.LanguageModelTextPart) {
			plainText += part.value;
			contentParts.push({ type: 'text', text: part.value });
			continue;
		}

		if (part instanceof vscode.LanguageModelDataPart && isImageMimeType(part.mimeType)) {
			if (!imageInputEnabled) {
				throw new Error('This model provider is not configured for image input.');
			}

			contentParts.push({
				type: 'image_url',
				image_url: {
					url: `data:${part.mimeType};base64,${Buffer.from(part.data).toString('base64')}`
				}
			});
			continue;
		}

		if (part instanceof vscode.LanguageModelToolCallPart) {
			const serialized = `Tool call ${part.name}: ${JSON.stringify(part.input)}`;
			plainText += serialized;
			contentParts.push({ type: 'text', text: serialized });
			continue;
		}

		if (part instanceof vscode.LanguageModelToolResultPart) {
			const serialized = stringifyToolResultContent(part.content);
			plainText += serialized;
			contentParts.push({ type: 'text', text: serialized });
		}
	}

	if (contentParts.length === 0 || (role !== 'user' && contentParts.every(part => part.type === 'text'))) {
		return {
			role,
			content: plainText,
			name: message.name,
		};
	}

	return {
		role,
		content: contentParts,
		name: message.name,
	};
}

async function consumeSseResponse(
	response: Response,
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	token: vscode.CancellationToken,
): Promise<void> {
	if (!response.body) {
		return;
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (!token.isCancellationRequested) {
			const result = await reader.read();
			if (result.done) {
				break;
			}

			buffer += decoder.decode(result.value, { stream: true });
			const events = buffer.split(/\r?\n\r?\n/);
			buffer = events.pop() ?? '';

			for (const event of events) {
				const payload = event
					.split(/\r?\n/)
					.filter(line => line.startsWith('data:'))
					.map(line => line.slice(5).trim())
					.join('\n');

				if (!payload || payload === '[DONE]') {
					continue;
				}

				const chunk = JSON.parse(payload) as OpenAIStreamChunk;
				const text = chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content;
				if (text) {
					progress.report(new vscode.LanguageModelTextPart(text));
				}
			}
		}

		buffer += decoder.decode();
	} finally {
		reader.releaseLock();
	}
}

function getModelConfiguration(
	model: ZeroCodeLanguageModelInformation,
	options: vscode.ProvideLanguageModelChatResponseOptions,
): ModelConfiguration {
	const configuration = options.modelConfiguration ?? {};
	const maxTokensValue = configuration.maxTokens;
	const temperatureValue = configuration.temperature;
	const topPValue = configuration.topP;

	return {
		maxTokens: typeof maxTokensValue === 'number' ? maxTokensValue : model.maxOutputTokens,
		temperature: typeof temperatureValue === 'number' ? temperatureValue : 0.2,
		topP: typeof topPValue === 'number' ? topPValue : 1,
	};
}

function buildModelConfigurationSchema(defaultMaxOutputTokens: number): vscode.LanguageModelConfigurationSchema {
	return {
		properties: {
			temperature: {
				type: 'number',
				title: 'Temperature',
				description: 'Sampling temperature used for this model.',
				minimum: 0,
				maximum: 2,
				default: 0.2,
				group: 'navigation'
			},
			topP: {
				type: 'number',
				title: 'Top P',
				description: 'Nucleus sampling cutoff for this model.',
				minimum: 0,
				maximum: 1,
				default: 1
			},
			maxTokens: {
				type: 'integer',
				title: 'Max Output Tokens',
				description: 'Maximum number of tokens requested from the model.',
				minimum: 1,
				default: defaultMaxOutputTokens,
				group: 'navigation'
			}
		}
	};
}

async function listOpenAICompatibleModels(
	endpoint: string,
	apiKey: string | undefined,
	timeoutMs: number,
	token: vscode.CancellationToken,
): Promise<ListedModel[]> {
	const payload = await fetchJson<OpenAIListResponse>(`${endpoint}/models`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			...buildAuthHeaders(apiKey),
		},
	}, timeoutMs, token);

	const models = payload.data ?? payload.models ?? [];
	return models.map(model => ({
		id: model.id,
		name: model.id,
		family: deriveFamily(model.id),
		version: typeof model.created === 'number' ? String(model.created) : deriveVersion(model.id),
		detail: model.owned_by,
		tooltip: `${endpoint}/models`,
	}));
}

async function listOllamaModels(
	endpoint: string,
	timeoutMs: number,
	token: vscode.CancellationToken,
): Promise<ListedModel[]> {
	const root = endpoint.endsWith('/v1') ? endpoint.slice(0, -3) : endpoint;
	const payload = await fetchJson<OllamaListResponse>(`${root}/api/tags`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
		},
	}, timeoutMs, token);

	return (payload.models ?? []).map(model => {
		const id = model.model ?? model.name ?? 'unknown';
		const extras = [model.details?.family, model.details?.parameter_size, model.details?.format].filter(Boolean).join(' | ');
		return {
			id,
			name: model.name ?? id,
			family: model.details?.family ?? deriveFamily(id),
			version: deriveVersion(id),
			detail: extras || undefined,
			tooltip: `${root}/api/tags`,
		};
	});
}

export class ZeroCodeLocalLanguageModelProvider implements vscode.LanguageModelChatProvider<ZeroCodeLanguageModelInformation> {

	private readonly _onDidChangeLanguageModelChatInformation = new vscode.EventEmitter<void>();
	readonly onDidChangeLanguageModelChatInformation = this._onDidChangeLanguageModelChatInformation.event;

	constructor(
		private readonly vendor: VendorId,
		private readonly fallbackEndpoint: string,
	) { }

	refresh(): void {
		this._onDidChangeLanguageModelChatInformation.fire();
	}

	async provideLanguageModelChatInformation(
		options: vscode.PrepareLanguageModelChatModelOptions,
		token: vscode.CancellationToken,
	): Promise<ZeroCodeLanguageModelInformation[]> {
		const configuration = (options.configuration ?? {}) as ProviderConfiguration;
		const endpoint = normalizeEndpoint(configuration.endpoint, this.fallbackEndpoint);
		const requestTimeout = typeof configuration.requestTimeout === 'number' ? configuration.requestTimeout : 120000;
		const maxInputTokens = typeof configuration.maxInputTokens === 'number' ? configuration.maxInputTokens : 32768;
		const maxOutputTokens = typeof configuration.maxOutputTokens === 'number' ? configuration.maxOutputTokens : 4096;
		const imageInputEnabled = !!configuration.imageInput;
		const defaultForChat = !!configuration.defaultForChat;
		const label = typeof configuration.label === 'string' && configuration.label.trim() ? configuration.label.trim() : undefined;
		const configuredModels = parseConfiguredModels(configuration.models);

		try {
			const discoveredModels = this.vendor === ZEROCODE_OLLAMA_VENDOR
				? await listOllamaModels(endpoint, requestTimeout, token)
				: await listOpenAICompatibleModels(endpoint, configuration.apiKey, requestTimeout, token);
			const listedModels = mergeListedModels(discoveredModels, configuredModels);

			return listedModels.map((model, index) => ({
				id: model.id,
				name: model.name,
				family: model.family,
				version: model.version,
				detail: label ?? model.detail,
				tooltip: model.tooltip ?? endpoint,
				maxInputTokens,
				maxOutputTokens,
				isUserSelectable: true,
				isDefault: defaultForChat && index === 0,
				category: {
					label: 'Local',
					order: 10,
				},
				capabilities: {
					imageInput: imageInputEnabled,
					toolCalling: false,
				},
				configurationSchema: buildModelConfigurationSchema(maxOutputTokens),
				endpoint,
				apiKey: configuration.apiKey,
				requestTimeout,
				imageInputEnabled,
			}));
		} catch (error) {
			if (configuredModels.length > 0) {
				return configuredModels.map((model, index) => ({
					id: model.id,
					name: model.name,
					family: model.family,
					version: model.version,
					detail: label,
					tooltip: endpoint,
					maxInputTokens,
					maxOutputTokens,
					isUserSelectable: true,
					isDefault: defaultForChat && index === 0,
					category: {
						label: 'Local',
						order: 10,
					},
					capabilities: {
						imageInput: imageInputEnabled,
						toolCalling: false,
					},
					configurationSchema: buildModelConfigurationSchema(maxOutputTokens),
					endpoint,
					apiKey: configuration.apiKey,
					requestTimeout,
					imageInputEnabled,
				}));
			}

			if (options.silent) {
				return [];
			}
			throw error;
		}
	}

	async provideLanguageModelChatResponse(
		model: ZeroCodeLanguageModelInformation,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
	): Promise<void> {
		const modelConfiguration = getModelConfiguration(model, options);
		const payload = {
			model: model.id,
			stream: true,
			messages: messages.map(message => toOpenAIMessage(message, model.imageInputEnabled)),
			temperature: modelConfiguration.temperature,
			top_p: modelConfiguration.topP,
			max_tokens: modelConfiguration.maxTokens,
		};

		const response = await fetchWithTimeout(`${model.endpoint}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...buildAuthHeaders(model.apiKey),
			},
			body: JSON.stringify(payload),
		}, model.requestTimeout, token);

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Request to ${model.endpoint}/chat/completions failed with ${response.status}: ${text || response.statusText}`);
		}

		const contentType = response.headers.get('content-type') ?? '';
		if (!contentType.includes('text/event-stream')) {
			const payload = await response.json() as OpenAIChatCompletionResponse;
			const text = payload.choices?.[0]?.message?.content;
			if (text) {
				progress.report(new vscode.LanguageModelTextPart(text));
			}
			return;
		}

		await consumeSseResponse(response, progress, token);
	}

	async provideTokenCount(
		_model: ZeroCodeLanguageModelInformation,
		text: string | vscode.LanguageModelChatRequestMessage,
		_token: vscode.CancellationToken,
	): Promise<number> {
		if (typeof text === 'string') {
			return approximateTokenCount(text);
		}

		let collected = '';
		for (const part of text.content) {
			if (part instanceof vscode.LanguageModelTextPart) {
				collected += part.value;
				continue;
			}
			if (part instanceof vscode.LanguageModelDataPart) {
				collected += `[data:${part.mimeType}]`;
				continue;
			}
			if (part instanceof vscode.LanguageModelToolCallPart) {
				collected += JSON.stringify(part.input);
				continue;
			}
			if (part instanceof vscode.LanguageModelToolResultPart) {
				collected += stringifyToolResultContent(part.content);
			}
		}
		return approximateTokenCount(collected);
	}
}
