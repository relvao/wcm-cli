import * as cheerio from "cheerio";
import * as fs from "fs-extra";
import * as glob from "glob";
import * as path from "path";
import { compose, defaultTo, isNil, reject } from "ramda";
import { getComponentOptions } from "../utilities/config";
import { fileNotFound } from "../utilities/errors";
import { copy, ensureDirectoryExists, readFile, writeToFile } from "../utilities/filesystem";
import { warn } from "../utilities/logger";

export async function exec(): Promise<any> {
  const { main, rootDir, outDir } = getComponentOptions();

  const processedPaths: string[] = [];

  for (const entryPath of ensureArray(main)) {
    for (const filePath of glob.sync(path.join(rootDir, entryPath))) {
      await processFile(rootDir, outDir, path.relative(rootDir, filePath), processedPaths);
    }
  }

  // const dependenciesPath = path.resolve(".", getPackageManager().packageManager);
  // const outputPath = path.resolve(".", "web_components");

  // for (const dependency of await readDir(dependenciesPath)) {
  //   const sourceDirectory = path.join(dependenciesPath, dependency);

  //   if (!fs.statSync(sourceDirectory).isDirectory()) {
  //     continue;
  //   }

  //   const bowerJson = await readBowerModuleJson(path.join(dependenciesPath, dependency));
  //   const outputDirectory = path.join(outputPath, dependency, bowerJson._release);

  //   fs.removeSync(outputDirectory);

  //   if (optimise) {
  //     if (!bowerJson.main) {
  //       warn("'%s' has not declared an entry file, skipping optimisation", dependency);
  //       await processDir(path.resolve(sourceDirectory), path.resolve(outputDirectory), "", processedPaths);
  //       continue;
  //     }

  //     for (const entryPath of typeof bowerJson.main === "string" ? [bowerJson.main] : bowerJson.main) {
  //       if (!fs.existsSync(path.join(sourceDirectory, entryPath))) {
  //         warn("'%s' has an entry file '%s' that does not exist, skipping optimisation", dependency, entryPath);

  //         await processDir(path.resolve(sourceDirectory), path.resolve(outputDirectory), "", processedPaths);
  //         break;
  //       }

  //       await processFile(path.resolve(sourceDirectory), path.resolve(outputDirectory), entryPath, processedPaths);
  //     }
  //   } else {
  //     await processDir(path.resolve(sourceDirectory), path.resolve(outputDirectory), "", processedPaths);
  //   }
  // }
}

export async function processDir(sourceDir: string, outputDir: string, dirPath: string, processedPaths: string[]): Promise<void> {
  const files = fs.readdirSync(path.join(sourceDir, dirPath));

  files.forEach(async (file) => {
    if (fs.statSync(path.join(sourceDir, dirPath, file)).isDirectory()) {
      await processDir(sourceDir, outputDir, path.join(dirPath, file), processedPaths);
    } else {
      await processFile(path.resolve(sourceDir), path.resolve(outputDir), path.join(dirPath, file), processedPaths);
    }
  });
}

export async function processFile(sourceDir: string, outputDir: string, filePath: string, processedPaths: string[]): Promise<void> {
  if (processedPaths.includes(path.resolve(sourceDir, filePath))) {
    return;
  } else {
    processedPaths.push(path.resolve(sourceDir, filePath));
  }

  if (!fs.existsSync(path.join(sourceDir, filePath))) {
    return fileNotFound(path.join(sourceDir, filePath)).handled();
  }

  await ensureDirectoryExists(path.dirname(path.join(outputDir, filePath)));

  switch (path.extname(filePath)) {
    case ".html":
      return readFile(path.join(sourceDir, filePath))
        .then((content: string): Promise<void> => {
          const $ = cheerio.load(content);

          return Promise.all([
            Promise.all($("link[rel='import']").not("[wcm-ignore]").toArray().map((link: CheerioElement) => processLinkElem($, link))),
            Promise.all($("script").not("[wcm-ignore]").toArray().map((script: CheerioElement) => processScriptElem($, script)))
              .then(compose(reject(isNil), defaultTo([])))
              .then((scripts: string[]): Promise<void> => {
                if (scripts.length) {
                  let i = 0;
                  let jsFileName = filePath.replace(".html", ".js");

                  while (fs.existsSync(path.join(sourceDir, jsFileName))) {
                    jsFileName = jsFileName.replace(".js", `_${++i}.js`);
                  }

                  $.root()
                    .append($("<wcm-script></wcm-script>")
                      .attr("path", path.basename(jsFileName)));

                  return writeToFile(path.join(outputDir, jsFileName), scripts.join(""));
                }
              }),
          ])
            .then(() => {
              return writeToFile(path.join(outputDir, filePath), $.html());
            });
        });

    default:
      return copy(path.join(sourceDir, filePath), path.join(outputDir, filePath));
  }

  function processLinkElem($: CheerioStatic, link: CheerioElement): Promise<void> {
    if (isRelative(sourceDir, filePath, link.attribs.href)) {
      return processFile(sourceDir, outputDir, path.join(path.dirname(filePath), link.attribs.href), processedPaths);
    } else {
      $(link)
        .replaceWith($("<wcm-link></wcm-link>")
          .attr("rel", link.attribs.rel)
          .attr("for", getDependencyName(link.attribs.href))
          .attr("path", getDependencyLookup(link.attribs.href)),
        );
    }
  }

  function processScriptElem($: CheerioStatic, script: CheerioElement): string | void {
    if (script.childNodes && script.childNodes.length) {
      $(script).remove();
      return (script.childNodes[0] as any).data;
    } else if (!isHttp(script.attribs.src)) {
      if (isRelative(sourceDir, filePath, script.attribs.src)) {
        $(script)
          .replaceWith($("<wcm-script></wcm-script>")
            .attr("path", script.attribs.src));
      } else {
        $(script)
          .replaceWith($("<wcm-script></wcm-script>")
            .attr("for", getDependencyName(script.attribs.src))
            .attr("path", getDependencyLookup(script.attribs.src)));
      }
    }
  }

}

function isRelative(sourcePath: string, relPathA: string, relPathB: string): boolean {
  try {
    return path.resolve(path.dirname(path.join(sourcePath, relPathA)), relPathB).includes(sourcePath + path.sep);
  } catch (err) {
    warn("Unable to determine relitivity from '%s' between '%s' and '%s'", sourcePath, relPathA, relPathB);
  }
}

function isHttp(src: string): boolean {
  return /http(s)?:\/\//.test(src);
}

function getDependencyName(url: string): string {
  return /([^./]+)/.exec(url)[0];
}

function getDependencyLookup(url: string): string {
  try {
    return /[^./]+\/(.*)/.exec(url)[1];
  } catch (err) {
    warn("Error whilst retrieving lookup from URL '%s'", url);
  }
}

function ensureArray<T>(val: T[] | T): T[] {
  return typeof val === "object" && val.constructor === Array
    ? val as T[]
    : [val as T];
}