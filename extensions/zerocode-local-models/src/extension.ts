/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	ZEROCODE_OLLAMA_VENDOR,
	ZEROCODE_OPENAI_COMPAT_VENDOR,
	ZeroCodeLocalLanguageModelProvider
} from './localLanguageModelProvider';

interface ProviderPreset {
	readonly label: string;
	readonly vendor: string;
	readonly name: string;
	readonly endpoint: string;
	readonly description: string;
	readonly customizableName?: boolean;
	readonly customizableEndpoint?: boolean;
	readonly supportsApiKey?: boolean;
}

interface ResolvedProviderPreset {
	readonly vendor: string;
	readonly name: string;
	readonly label: string;
	readonly endpoint: string;
	readonly apiKey?: string;
}

interface LocalChatSetupAction extends vscode.QuickPickItem {
	readonly run: () => Thenable<void> | void;
}

const manageModelsButtonLabel = 'Manage Models';
const openLocalChatButtonLabel = 'Open Local Chat';
const chatManageCommand = 'workbench.action.chat.manage';
const localChatInSidebarCommand = 'workbench.action.chat.openNewChatSessionInPlace.local';
const openChatCommand = 'workbench.action.chat.open';

interface RecommendedOllamaModel {
	readonly id: string;
	readonly description: string;
}

const recommendedOllamaModels: readonly RecommendedOllamaModel[] = [
	{ id: 'qwen2.5-coder:1.5b', description: 'Fast lightweight coding model.' },
	{ id: 'llama3.1', description: 'General local assistant with broad ecosystem support.' },
	{ id: 'qwq', description: 'Reasoning-oriented local model.' },
	{ id: 'deepseek-r1', description: 'Strong reasoning and coding hybrid.' },
	{ id: 'devstral:latest', description: 'Larger coding-focused model for local agent workflows.' },
];

const providerPresets: readonly ProviderPreset[] = [
	{
		label: 'Ollama',
		vendor: ZEROCODE_OLLAMA_VENDOR,
		name: 'Ollama',
		endpoint: 'http://127.0.0.1:11434/v1',
		description: 'Recommended for local free models served by Ollama.'
	},
	{
		label: 'LM Studio',
		vendor: ZEROCODE_OPENAI_COMPAT_VENDOR,
		name: 'LM Studio',
		endpoint: 'http://127.0.0.1:1234/v1',
		description: 'Use LM Studio through its OpenAI-compatible local server.'
	},
	{
		label: 'OpenAI Compatible',
		vendor: ZEROCODE_OPENAI_COMPAT_VENDOR,
		name: 'OpenAI Compatible',
		endpoint: 'http://127.0.0.1:8000/v1',
		description: 'Use any endpoint that implements the OpenAI-compatible chat API.',
		customizableName: true,
		customizableEndpoint: true,
		supportsApiKey: true,
	}
];

async function resolveProviderName(preset: ProviderPreset): Promise<string | undefined> {
	if (!preset.customizableName) {
		return preset.name;
	}

	const value = await vscode.window.showInputBox({
		title: `Add ${preset.label} Provider`,
		prompt: 'Choose a name for this provider group.',
		placeHolder: 'LocalAI, vLLM, or another provider name',
		value: preset.name,
		ignoreFocusOut: true,
		validateInput: input => input.trim() ? undefined : 'Provider name is required.',
	});

	if (!value) {
		return undefined;
	}

	return value.trim();
}

async function resolveProviderEndpoint(preset: ProviderPreset): Promise<string | undefined> {
	if (!preset.customizableEndpoint) {
		return preset.endpoint;
	}

	const value = await vscode.window.showInputBox({
		title: `Add ${preset.label} Provider`,
		prompt: 'Enter the base URL for the OpenAI-compatible endpoint.',
		placeHolder: 'http://127.0.0.1:8000/v1',
		value: preset.endpoint,
		ignoreFocusOut: true,
		validateInput: input => input.trim() ? undefined : 'Endpoint is required.',
	});

	if (!value) {
		return undefined;
	}

	return value.trim();
}

async function resolveProviderApiKey(preset: ProviderPreset): Promise<string | undefined> {
	if (!preset.supportsApiKey) {
		return undefined;
	}

	const value = await vscode.window.showInputBox({
		title: `Add ${preset.label} Provider`,
		prompt: 'Optional API key sent as a Bearer token.',
		placeHolder: 'Leave empty if your local endpoint does not require authentication',
		password: true,
		ignoreFocusOut: true,
	});

	return value?.trim() || undefined;
}

async function resolveProviderPreset(preset: ProviderPreset): Promise<ResolvedProviderPreset | undefined> {
	const name = await resolveProviderName(preset);
	if (!name) {
		return undefined;
	}

	const endpoint = await resolveProviderEndpoint(preset);
	if (!endpoint) {
		return;
	}

	const apiKey = await resolveProviderApiKey(preset);

	return {
		vendor: preset.vendor,
		name,
		label: name === preset.name ? preset.label : name,
		endpoint,
		apiKey,
	};
}

async function addProviderPreset(preset: ProviderPreset): Promise<void> {
	const resolvedPreset = await resolveProviderPreset(preset);
	if (!resolvedPreset) {
		return;
	}

	try {
		await vscode.commands.executeCommand('lm.addLanguageModelsProviderGroup', {
			vendor: resolvedPreset.vendor,
			name: resolvedPreset.name,
			label: resolvedPreset.label,
			endpoint: resolvedPreset.endpoint,
			apiKey: resolvedPreset.apiKey,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes('already exists')) {
			await showProviderActionMessage(`${resolvedPreset.label} is already configured.`);
			return;
		}

		void vscode.window.showErrorMessage(`Failed to add ${preset.label}: ${message}`);
		return;
	}

	await showProviderActionMessage(`${resolvedPreset.label} provider added to chat models.`);
}

async function openLocalModelsWalkthrough(): Promise<void> {
	await vscode.commands.executeCommand('workbench.action.openWalkthrough', 'zerocode.localModelsWelcome');
}

async function openLocalChat(): Promise<void> {
	try {
		await vscode.commands.executeCommand(localChatInSidebarCommand, 'sidebar');
	} catch {
		await vscode.commands.executeCommand(openChatCommand);
	}
}

async function getAvailableLocalModels(): Promise<readonly vscode.LanguageModelChat[]> {
	const results = await Promise.allSettled([
		vscode.lm.selectChatModels({ vendor: ZEROCODE_OLLAMA_VENDOR }),
		vscode.lm.selectChatModels({ vendor: ZEROCODE_OPENAI_COMPAT_VENDOR }),
	]);

	return results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}

async function startLocalChat(): Promise<void> {
	const availableModels = await getAvailableLocalModels();
	if (availableModels.length > 0) {
		await openLocalChat();
		return;
	}

	const picked = await vscode.window.showQuickPick<LocalChatSetupAction>(
		[
			{
				label: 'Add Ollama Provider',
				description: 'Recommended for a free local-first setup.',
				run: () => addProviderPreset(providerPresets[0]),
			},
			{
				label: 'Install Recommended Ollama Model',
				description: 'Pull a coding-friendly local model in the integrated terminal.',
				run: () => installRecommendedOllamaModel(),
			},
			{
				label: 'Add LM Studio Provider',
				description: 'Use LM Studio through its local OpenAI-compatible server.',
				run: () => addProviderPreset(providerPresets[1]),
			},
			{
				label: 'Add OpenAI-Compatible Provider',
				description: 'Connect LocalAI, vLLM, or another compatible local server.',
				run: () => addProviderPreset(providerPresets[2]),
			},
			{
				label: 'Manage Chat Models',
				description: 'Review configured providers and model-level settings.',
				run: () => vscode.commands.executeCommand(chatManageCommand),
			},
			{
				label: 'Open Local Model Setup Guide',
				description: 'Walk through the recommended ZeroCode local setup flow.',
				run: () => openLocalModelsWalkthrough(),
			},
		],
		{
			title: 'Start Local Chat',
			placeHolder: 'No ZeroCode local models are ready yet. Choose the next setup step.',
		}
	);

	if (!picked) {
		return;
	}

	await picked.run();
}

async function showProviderActionMessage(message: string): Promise<void> {
	const choice = await vscode.window.showInformationMessage(
		message,
		openLocalChatButtonLabel,
		manageModelsButtonLabel
	);

	if (choice === openLocalChatButtonLabel) {
		await openLocalChat();
		return;
	}

	if (choice === manageModelsButtonLabel) {
		await vscode.commands.executeCommand(chatManageCommand);
	}
}

async function installRecommendedOllamaModel(): Promise<void> {
	const picked = await vscode.window.showQuickPick(
		recommendedOllamaModels.map(model => ({
			label: model.id,
			description: model.description,
			model,
		})),
		{
			title: 'Install Recommended Ollama Model',
			placeHolder: 'Choose a recommended local model to pull with Ollama',
		}
	);

	if (!picked) {
		return;
	}

	const terminal = vscode.window.createTerminal({
		name: 'ZeroCode Ollama',
	});
	terminal.show(true);
	terminal.sendText(`ollama pull ${picked.model.id}`, true);

	const choice = await vscode.window.showInformationMessage(
		`Started installing ${picked.model.id} in the integrated terminal.`,
		'Add Ollama Provider',
		openLocalChatButtonLabel
	);

	if (choice === 'Add Ollama Provider') {
		await addProviderPreset(providerPresets[0]);
		return;
	}

	if (choice === openLocalChatButtonLabel) {
		await openLocalChat();
	}
}

export function activate(context: vscode.ExtensionContext): void {
	const ollamaProvider = new ZeroCodeLocalLanguageModelProvider(ZEROCODE_OLLAMA_VENDOR, 'http://127.0.0.1:11434/v1');
	const openAICompatibleProvider = new ZeroCodeLocalLanguageModelProvider(ZEROCODE_OPENAI_COMPAT_VENDOR, 'http://127.0.0.1:1234/v1');

	context.subscriptions.push(
		vscode.lm.registerLanguageModelChatProvider(
			ZEROCODE_OLLAMA_VENDOR,
			ollamaProvider
		)
	);

	context.subscriptions.push(
		vscode.lm.registerLanguageModelChatProvider(
			ZEROCODE_OPENAI_COMPAT_VENDOR,
			openAICompatibleProvider
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('zerocode.localModels.addProvider', async () => {
			const picked = await vscode.window.showQuickPick(
				providerPresets.map(preset => ({
					label: preset.label,
					description: preset.description,
					preset,
				})),
				{
					title: 'Add Local Model Provider',
					placeHolder: 'Choose a local-first provider preset',
				}
			);

			if (!picked) {
				return;
			}

			await addProviderPreset(picked.preset);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('zerocode.localModels.addOllama', async () => {
			await addProviderPreset(providerPresets[0]);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('zerocode.localModels.addLMStudio', async () => {
			await addProviderPreset(providerPresets[1]);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('zerocode.localModels.addOpenAICompatible', async () => {
			await addProviderPreset(providerPresets[2]);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('zerocode.localModels.installRecommendedOllamaModel', async () => {
			await installRecommendedOllamaModel();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('zerocode.localModels.refreshProviders', async () => {
			ollamaProvider.refresh();
			openAICompatibleProvider.refresh();
			void vscode.window.showInformationMessage('Local model providers refreshed.');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('zerocode.localModels.manageModels', async () => {
			await vscode.commands.executeCommand(chatManageCommand);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('zerocode.localModels.openChat', async () => {
			await openLocalChat();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('zerocode.localModels.startChat', async () => {
			await startLocalChat();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('zerocode.localModels.openWalkthrough', async () => {
			await openLocalModelsWalkthrough();
		})
	);
}
