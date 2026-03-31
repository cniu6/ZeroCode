/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';

const ZEROCODE_CATEGORY = localize2('zerocode.category', 'ZeroCode');

const OPEN_LOCAL_MODEL_SETUP_GUIDE_COMMAND = 'zerocode.localModels.openWalkthrough';
const ADD_LOCAL_MODEL_PROVIDER_COMMAND = 'zerocode.localModels.addProvider';
const ADD_OLLAMA_PROVIDER_COMMAND = 'zerocode.localModels.addOllama';
const ADD_LM_STUDIO_PROVIDER_COMMAND = 'zerocode.localModels.addLMStudio';
const INSTALL_RECOMMENDED_OLLAMA_MODEL_COMMAND = 'zerocode.localModels.installRecommendedOllamaModel';
const MANAGE_CHAT_MODELS_COMMAND = 'zerocode.localModels.manageModels';
const START_LOCAL_CHAT_COMMAND = 'zerocode.localModels.startChat';

abstract class ZeroCodeWorkbenchAction extends Action2 {

	constructor(
		id: string,
		title: ReturnType<typeof localize2>,
		private readonly delegateCommandId: string,
		options?: {
			f1?: boolean;
			menu?: NonNullable<ConstructorParameters<typeof Action2>[0]['menu']>;
		}
	) {
		super({
			id,
			title,
			category: ZEROCODE_CATEGORY,
			f1: options?.f1 ?? true,
			menu: options?.menu,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(ICommandService).executeCommand(this.delegateCommandId);
	}
}

registerAction2(class extends ZeroCodeWorkbenchAction {
	constructor() {
		super(
			'workbench.action.zerocode.openChat',
			localize2('zerocode.openChat', 'Start Local Chat'),
			START_LOCAL_CHAT_COMMAND,
			{
				menu: {
					id: MenuId.ChatWelcomeContext,
					group: '1_setup',
					order: 1,
					when: ContextKeyExpr.and(ChatContextKeys.enabled),
				}
			}
		);
	}
});

registerAction2(class extends ZeroCodeWorkbenchAction {
	constructor() {
		super(
			'workbench.action.zerocode.openLocalModelSetupGuide',
			localize2('zerocode.openLocalModelSetupGuide', 'Open Local Model Setup Guide'),
			OPEN_LOCAL_MODEL_SETUP_GUIDE_COMMAND,
			{
				menu: [
					{
						id: MenuId.MenubarHelpMenu,
						group: '1_welcome',
						order: 2,
					},
					{
						id: MenuId.ChatWelcomeContext,
						group: '1_setup',
						order: 2,
						when: ChatContextKeys.enabled,
					}
				]
			}
		);
	}
});

registerAction2(class extends ZeroCodeWorkbenchAction {
	constructor() {
		super(
			'workbench.action.zerocode.addOllamaProvider',
			localize2('zerocode.addOllamaProvider', 'Add Ollama Provider'),
			ADD_OLLAMA_PROVIDER_COMMAND,
			{
				menu: {
					id: MenuId.ChatWelcomeContext,
					group: '1_setup',
					order: 3,
					when: ChatContextKeys.enabled,
				}
			}
		);
	}
});

registerAction2(class extends ZeroCodeWorkbenchAction {
	constructor() {
		super(
			'workbench.action.zerocode.installRecommendedOllamaModel',
			localize2('zerocode.installRecommendedOllamaModel', 'Install Recommended Ollama Model'),
			INSTALL_RECOMMENDED_OLLAMA_MODEL_COMMAND,
			{
				menu: {
					id: MenuId.ChatWelcomeContext,
					group: '1_setup',
					order: 4,
					when: ChatContextKeys.enabled,
				}
			}
		);
	}
});

registerAction2(class extends ZeroCodeWorkbenchAction {
	constructor() {
		super(
			'workbench.action.zerocode.addLMStudioProvider',
			localize2('zerocode.addLMStudioProvider', 'Add LM Studio Provider'),
			ADD_LM_STUDIO_PROVIDER_COMMAND,
			{
				menu: {
					id: MenuId.ChatWelcomeContext,
					group: '1_setup',
					order: 5,
					when: ChatContextKeys.enabled,
				}
			}
		);
	}
});

registerAction2(class extends ZeroCodeWorkbenchAction {
	constructor() {
		super(
			'workbench.action.zerocode.addLocalModelProvider',
			localize2('zerocode.addLocalModelProvider', 'Add Local Model Provider...'),
			ADD_LOCAL_MODEL_PROVIDER_COMMAND,
			{
				menu: {
					id: MenuId.ChatWelcomeContext,
					group: '1_setup',
					order: 6,
					when: ChatContextKeys.enabled,
				}
			}
		);
	}
});

registerAction2(class extends ZeroCodeWorkbenchAction {
	constructor() {
		super(
			'workbench.action.zerocode.manageChatModels',
			localize2('zerocode.manageChatModels', 'Manage Chat Models'),
			MANAGE_CHAT_MODELS_COMMAND,
			{
				menu: {
					id: MenuId.ChatWelcomeContext,
					group: '2_settings',
					order: 1,
					when: ContextKeyExpr.and(ChatContextKeys.enabled),
				}
			}
		);
	}
});
