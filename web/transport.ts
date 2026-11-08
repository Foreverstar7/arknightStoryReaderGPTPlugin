import { ReaderService } from '../src/server/service.js';
import { PrtsSource } from '../src/data/prts.js';
import {
  decodeToolResult,
  type ToolInput,
  type ToolOutput,
} from '../src/shared/tools.js';
import type { ToolName } from '../src/shared/contracts.js';
import type { ReaderTransport } from '../src/ui/transport.js';
import { browserPrtsFetch, readBrowserWiki } from './prts-api.js';

export const WEB_DATABASE = 'arknights-story-reader.web.v1';
/** Build aliases select browser stores; no local HTTP/MCP request is made. */
export class BrowserReaderTransport implements ReaderTransport {
  private readonly service = new ReaderService(
    new PrtsSource(WEB_DATABASE, readBrowserWiki, browserPrtsFetch),
    WEB_DATABASE,
  );
  async call<Name extends ToolName>(
    name: Name,
    args: ToolInput<Name>,
  ): Promise<ToolOutput<Name>> {
    return decodeToolResult(name, args, await this.service.call(name, args));
  }
}
