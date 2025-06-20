import path from 'node:path';

import { HeyApiError } from '../error';
import { TypeScriptFile } from '../generate/files';
import { PluginInstance } from '../plugins/shared/utils/instance';
import type { Config, StringCase } from '../types/config';
import type { Files } from '../types/utils';
import { resolveRef } from '../utils/ref';
import type { IR } from './types';

// Helper type to extract the original config type from Plugin.Config and ensure it satisfies BaseConfig
type ExtractConfig<T> = T extends { config: infer C }
  ? C & { name: string }
  : never;

// Helper type to map plugin names to their specific PluginInstance types
type PluginInstanceMap = {
  [K in keyof Config['plugins']]?: PluginInstance<
    ExtractConfig<Config['plugins'][K]>
  >;
};

export interface ContextFile {
  /**
   * Should the exports from this file be re-exported in the index barrel file?
   */
  exportFromIndex?: boolean;
  /**
   * Unique file identifier.
   */
  id: string;
  /**
   * Define casing for identifiers in this file.
   */
  identifierCase?: StringCase;
  /**
   * Relative file path to the output path.
   *
   * @example
   * 'bar/foo.ts'
   */
  path: string;
}

export interface Events {
  /**
   * Called after parsing.
   */
  after: () => void;
  /**
   * Called before parsing.
   */
  before: () => void;
  operation: (args: {
    method: keyof IR.PathItemObject;
    operation: IR.OperationObject;
    path: string;
  }) => void;
  parameter: (args: {
    $ref: string;
    name: string;
    parameter: IR.ParameterObject;
  }) => void;
  requestBody: (args: {
    $ref: string;
    name: string;
    requestBody: IR.RequestBodyObject;
  }) => void;
  schema: (args: {
    $ref: string;
    name: string;
    schema: IR.SchemaObject;
  }) => void;
  server: (args: { server: IR.ServerObject }) => void;
}

type ListenerWithMeta<T extends keyof Events> = {
  callbackFn: Events[T];
  pluginName: string;
};

type Listeners = {
  [T in keyof Events]?: Array<ListenerWithMeta<T>>;
};

export class IRContext<Spec extends Record<string, any> = any> {
  /**
   * Configuration for parsing and generating the output. This
   * is a mix of user-provided and default values.
   */
  public config: Config;
  /**
   * A map of files that will be generated from `spec`.
   */
  public files: Files;
  /**
   * Intermediate representation model obtained from `spec`.
   */
  public ir: IR.Model;
  /**
   * A map of registered plugin instances, keyed by plugin name. Plugins are
   * registered through the `registerPlugin` method and can be accessed by
   * their configured name from the config.
   */
  public plugins: PluginInstanceMap = {};
  /**
   * Resolved specification from `input`.
   */
  public spec: Spec;

  /**
   * A map of event listeners.
   */
  private listeners: Listeners;

  constructor({ config, spec }: { config: Config; spec: Spec }) {
    this.config = config;
    this.files = {};
    this.ir = {};
    this.listeners = {};
    this.spec = spec;
  }

  /**
   * Notify all event listeners about `event`.
   */
  public async broadcast<T extends keyof Events>(
    event: T,
    ...args: Parameters<Events[T]>
  ): Promise<void> {
    const eventListeners = this.listeners[event];

    if (eventListeners) {
      for (const listener of eventListeners) {
        try {
          await listener.callbackFn(
            // @ts-expect-error
            ...args,
          );
        } catch (error) {
          const originalError =
            error instanceof Error ? error : new Error(String(error));
          throw new HeyApiError({
            args,
            error: originalError,
            event,
            name: 'BroadcastError',
            pluginName: listener.pluginName,
          });
        }
      }
    }
  }

  /**
   * Create and return a new TypeScript file. Also set the current file context
   * to the newly created file.
   */
  public createFile(file: ContextFile): TypeScriptFile {
    // TODO: parser - handle attempt to create duplicate
    const outputParts = file.path.split('/');
    const outputDir = path.resolve(
      this.config.output.path,
      ...outputParts.slice(0, outputParts.length - 1),
    );
    const createdFile = new TypeScriptFile({
      dir: outputDir,
      exportFromIndex: file.exportFromIndex,
      id: file.id,
      identifierCase: file.identifierCase,
      name: `${outputParts[outputParts.length - 1]}.ts`,
    });
    this.files[file.id] = createdFile;
    return createdFile;
  }

  /**
   * Returns a resolved and dereferenced schema from `spec`.
   */
  public dereference<T>(schema: { $ref: string }) {
    const resolved = this.resolveRef<T>(schema.$ref);
    const dereferenced = {
      ...schema,
      ...resolved,
    } as T;
    // @ts-expect-error
    delete dereferenced.$ref;
    return dereferenced;
  }

  /**
   * Returns a specific file by ID from `files`.
   */
  public file({ id }: Pick<ContextFile, 'id'>): TypeScriptFile | undefined {
    return this.files[id];
  }

  /**
   * Registers a new plugin to the global context.
   *
   * @param name Plugin name.
   * @returns Registered plugin instance.
   */
  private registerPlugin(name: keyof Config['plugins']): PluginInstance {
    const plugin = this.config.plugins[name]!;
    const instance = new PluginInstance({
      config: plugin.config,
      context: this as any,
      dependencies: plugin.dependencies ?? [],
      handler: plugin.handler,
      name: plugin.name,
      output: plugin.output!,
    });
    this.plugins[instance.name] = instance;
    return instance;
  }

  /**
   * Generator that iterates through plugin order and registers each plugin.
   * Yields the registered plugin instance for each plugin name.
   */
  public *registerPlugins(): Generator<PluginInstance> {
    for (const name of this.config.pluginOrder) {
      yield this.registerPlugin(name);
    }
  }

  // TODO: parser - works the same as resolveRef, but for IR schemas.
  // for now, they map 1:1, but if they diverge (like with OpenAPI 2.0),
  // we will want to rewrite $refs at parse time, so they continue pointing
  // to the correct IR location
  public resolveIrRef<T>($ref: string) {
    return resolveRef<T>({
      $ref,
      spec: this.ir,
    });
  }

  /**
   * Returns a resolved reference from `spec`.
   */
  public resolveRef<T>($ref: string) {
    return resolveRef<T>({
      $ref,
      spec: this.spec,
    });
  }

  /**
   * Register a new `event` listener.
   */
  public subscribe<T extends keyof Events>(
    event: T,
    callbackFn: Events[T],
    pluginName: string,
  ): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push({
      callbackFn,
      pluginName: pluginName ?? '',
    });
  }
}
