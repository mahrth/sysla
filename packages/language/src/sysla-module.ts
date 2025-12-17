import { type Module, inject } from 'langium';
import { createDefaultModule, createDefaultSharedModule, type DefaultSharedModuleContext, type LangiumServices, type LangiumSharedServices, type PartialLangiumServices } from 'langium/lsp';
import { SyslaGeneratedModule, SyslaGeneratedSharedModule } from './generated/module.js';
import { SyslaValidator, registerValidationChecks } from './sysla-validator.js';
import { SyslaScopeProvider } from './sysla-scope-provider.js';  // <-- NEU

export type SyslaAddedServices = {
    validation: {
        SyslaValidator: SyslaValidator
    }
}

export type SyslaServices = LangiumServices & SyslaAddedServices

export const SyslaModule: Module<SyslaServices, PartialLangiumServices & SyslaAddedServices> = {
    references: {                                          // <-- NEU
        ScopeProvider: (services) => new SyslaScopeProvider(services)  // <-- NEU
    },                                                     // <-- NEU
    validation: {
        SyslaValidator: () => new SyslaValidator()
    }
};

// Rest bleibt gleich...
export function createSyslaServices(context: DefaultSharedModuleContext): {
    shared: LangiumSharedServices,
    Sysla: SyslaServices
} {
    const shared = inject(
        createDefaultSharedModule(context),
        SyslaGeneratedSharedModule
    );
    const Sysla = inject(
        createDefaultModule({ shared }),
        SyslaGeneratedModule,
        SyslaModule
    );
    shared.ServiceRegistry.register(Sysla);
    registerValidationChecks(Sysla);
    if (!context.connection) {
        shared.workspace.ConfigurationProvider.initialized({});
    }
    return { shared, Sysla };
}