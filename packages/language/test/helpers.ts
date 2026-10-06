import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createSyslaServices, type Model } from 'sysla-language';

export function parseModel(text: string) {
    const services = createSyslaServices(EmptyFileSystem);
    return parseHelper<Model>(services.Sysla)(text, { validation: true });
}
