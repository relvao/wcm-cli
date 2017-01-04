/**
 * Dependencies
 */
import * as fs from "fs";
import * as path from "path";
import * as errors from "./errors";
import { readFileAsJson, removeDirectory, copyModule } from "./filesystem";

interface IDependencyShorthandProps {
  readonly name: string;
  readonly path: string;
  readonly type: "bower" | "npm";
  readonly version: string;
  readonly dependencies: string[];
}

interface IDependencyShorthand extends IDependencyShorthandProps {
  generateDependencyPointer(): string;
}

export class DependencyShorthand implements IDependencyShorthand {

  public readonly name: string;
  public readonly path: string;
  public readonly type: "bower" | "npm";
  public readonly version: string;
  public readonly dependencies: string[];

  constructor(args: IDependencyShorthandProps) {
    Object.assign(this, args);
  }

  /**
   * Generate a dependency pointer for this dependency.
   */
  public generateDependencyPointer(): string {
    "use strict";

    return generateDependencyPointer(this.name, this.version);
  }

}

interface IDependencyGraphVerbose {
  readonly dependencies: {
    [dependencyName: string]: IDependencyShorthand
  };
}

export interface IDependencyGraphReadable {
  graph: { [dependencyName: string]: string[] };
  shrinkwrap: { [dependencyName: string]: string };
}

export class DependencyGraph implements IDependencyGraphVerbose {

  readonly dependencies: {
    [dependencyName: string]: IDependencyShorthand
  } = {};

  /**
   * Add a dependency to the dependency graph.
   */
  public addDependency(dependency: IDependencyShorthand): void {
    "use strict";

    this.dependencies[dependency.name] = dependency;
  }

  /**
   * Check to see whether or not a dependency with the supplied name is currently held within this instance of the
   * dependency graph.
   */
  public hasDependency(dependencyName: string): boolean {
    "use strict";

    return this.dependencies[dependencyName] !== undefined;
  }

  /**
   * Copy the modules currently held within this instance of the dependency graph to the output destination supplied.
   * Please note that this function will also clear the contents of the output destination prior to performing this
   * task.
   */
  public async copyModules(outDestination: string): Promise<void> {
    "use strict";

    await removeDirectory(outDestination);

    for (let dependency of Object.values(this.dependencies)) {
      await copyModule(dependency.path, path.join(outDestination, dependency.name, dependency.version));
    }
  }

  /**
   * Convert this verbose dependency graph into a human readable dependency graph.
   */
  public toReadable(): IDependencyGraphReadable {
    "use strict";

    const dependencyGraphReadable: IDependencyGraphReadable = {
      graph: {},
      shrinkwrap: {}
    };

    for (let dependency of Object.values(this.dependencies)) {
      dependencyGraphReadable.graph[dependency.name] = dependency.dependencies
        .map((dependency: string): string => {
          return this.dependencies[dependency].name;
        });

      dependencyGraphReadable.shrinkwrap[dependency.name] = dependency.version;
    }

    return dependencyGraphReadable;
  }

}

/**
 * Read and parse the package JSON file at the supplied path.
 */
export function readPackageJson(projectPath: string): IPackageJSON {
  "use strict";

  return readFileAsJson<IPackageJSON>(path.resolve(projectPath, "package.json"));
}

/**
 * Read and parse the bower JSON file at the supplied path.
 */
export function readBowerJson(projectPath: string): IBowerJSON {
  "use strict";

  return readFileAsJson<IBowerJSON>(path.resolve(projectPath, "bower.json"));
}

/**
 * Read and parse the release/module bower JSON file at the supplied path.
 */
export function readBowerModuleJson(modulePath: string): IBowerModuleJSON {
  "use strict";

  return readFileAsJson<IBowerModuleJSON>(path.resolve(modulePath, ".bower.json"));
}

/**
 * Generate a dependency pointer.
 */
export function generateDependencyPointer(dependencyName: string, dependencyVersion: string): string {
  "use strict";

  return `${dependencyName}@${dependencyVersion}`;
}

export interface IPackageJSON extends Object {

  readonly name: string;

  readonly version?: string;

  readonly description?: string;

  readonly keywords?: string[];

  readonly homepage?: string;

  readonly bugs?: string | IBugs;

  readonly license?: string;

  readonly author?: string | IAuthor;

  readonly contributors?: string[] | IAuthor[];

  readonly files?: string[];

  readonly main?: string;

  readonly bin?: string | IBinMap;

  readonly man?: string | string[];

  readonly directories?: IDirectories;

  readonly repository?: string | IRepository;

  readonly scripts?: IScriptsMap;

  readonly config?: IConfig;

  readonly dependencies?: IDependencyMap;

  readonly devDependencies?: IDependencyMap;

  readonly peerDependencies?: IDependencyMap;

  readonly optionalDependencies?: IDependencyMap;

  readonly bundledDependencies?: string[];

  readonly engines?: IEngines;

  readonly os?: string[];

  readonly cpu?: string[];

  readonly preferGlobal?: boolean;

  readonly private?: boolean;

  readonly publishConfig?: IPublishConfig;

}

export interface IBowerJSON extends Object {

  /**
   * The name of the package as stored in the registry.
   */
  readonly name: string;

  /**
   * A description of the package limited to 140 characters.
   */
  readonly description?: string;

  /**
   * The entry-point files necessary to use your package.
   */
  readonly main?: string | string[];

  /**
   * The type of module defined in the main JavaScript file.
   */
  readonly moduleType?: BowerModuleType | BowerModuleType[];

  /**
   * SPDX license identifier or path/url to a license.
   */
  readonly license?: string | string[];

  /**
   * A list of files for Bower to ignore when installing your package.
   */
  readonly ignore?: string[];

  /**
   * Helps make your package easier to discover without people needing to know its name.
   */
  readonly keywords?: string[];

  /**
   * A list of people that authored the contents of the package.
   */
  readonly authors?: string[] | IAuthor[];

  /**
   * URL to learn more about the package.
   */
  readonly homepage?: string;

  /**
   * The repository in which the source code can be found.
   */
  readonly repository?: IRepository;

  /**
   * Dependencies are specified with a simple hash of package name to a semver compatible identifier or URL.
   */
  readonly dependencies?: IDependencyMap;

  /**
   * Dependencies that are only needed for development of the package, e.g., test framework or building documentation.
   */
  readonly devDependencies?: IDependencyMap;

  /**
   * Dependency versions to automatically resolve with if conflicts occur between packages.
   */
  readonly resolutions?: IDependencyMap;

  /**
   * If set to true, Bower will refuse to publish it.
   */
  readonly private?: boolean;

}

export interface IBowerModuleJSON extends IBowerJSON {
  readonly _release: string;
}

enum BowerModuleType {
  "globals",
  "amd",
  "node",
  "es6",
  "yui"
}

/**
 * An author or contributor.
 */
interface IAuthor {
  readonly name: string;
  readonly email?: string;
  readonly homepage?: string;
}

/**
 * A map of exposed bin commands.
 */
interface IBinMap {
  readonly[commandName: string]: string;
}

/**
 * A bugs link.
 */
interface IBugs {
  readonly email: string;
  readonly url: string;
}

interface IConfig {
  readonly name?: string;
  readonly config?: Object;
}

/**
 * A map of dependencies.
 */
export interface IDependencyMap {
  readonly[dependencyName: string]: string;
}

/**
 * CommonJS package structure.
 */
interface IDirectories {
  readonly lib?: string;
  readonly bin?: string;
  readonly man?: string;
  readonly doc?: string;
  readonly example?: string;
}

interface IEngines {
  readonly node?: string;
  readonly npm?: string;
}

interface IPublishConfig {
  readonly registry?: string;
}

/**
 * A project repository.
 */
interface IRepository {
  readonly type: string;
  readonly url: string;
}

interface IScriptsMap {
  readonly[scriptName: string]: string;
}

export * from "./filesystem"
