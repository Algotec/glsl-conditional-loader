const fs = require("fs");
const babel = require('babel-core');
const path = require('path');
const loaderUtils = require('loader-utils');
const acorn = require('acorn');

module.exports = function (content) {
    const loader = this;
    this.cacheable();
    const callback = this.async();

    const filesCache = new Map();

    const defaultOptions = {
        verbose: false,
        es5: true
    };

    function log(message) {
        if (options.verbose) {
            console.log(message);
        }
    }

    const loaderOptions = loaderUtils.getOptions(loader);
    const options = Object.assign({}, defaultOptions, loaderOptions);


    createDependancyTree(content, this.context, this.resourcePath)
        .then((dependencyTree) => replaceContent(content, dependencyTree))
        .then(createMethod)
        .then((result) => callback(null, result))
        .catch((error) => callback(error));


    function createDependancyTree(content, context, parentfileName, higherLevelFilePaths) {
        if (typeof higherLevelFilePaths == 'undefined') {
            higherLevelFilePaths = new Set();
        }
        let fixedIncludesList;
        log("Dependancy walk: " + parentfileName);
        return parseIncludes(content, parentfileName)
            .then((includesList) => {
                fixedIncludesList = includesList;
                return includesList.map((include, index) => {
                    log("Reading " + include.fileName);
                    return readFile(include.fileName, context)
                        .then((fileData) => {
                            if (higherLevelFilePaths.has(fileData.path)) {
                                // Circular dependency
                                throw new Error("Reached a circular dependancy when loading " + include.fileName + " from " + parentfileName);
                            }
                            fixedIncludesList[index].filePath = fileData.path;
                            fixedIncludesList[index].content = fileData.content;
                            return createDependancyTree(fileData.content, fileData.context, fileData.path, new Set([...higherLevelFilePaths, fileData.path]));
                        })
                });
            })
            .then((promisesList) => {
                return Promise.all(promisesList);
            })
            .then((values) => {
                return fixedIncludesList.map((include, index) => {
                    return Object.assign(include, {subIncludes: values[index]});
                })
            });

    }

    function parseIncludes(content, parent) {
        return new Promise((resolve) => {
            const includesList = [];
            const includeRE = /^#include (.+)(\r\n|\r|\n)?/gm;
            let match;
            while (match = includeRE.exec(content)) {
                const line = match[0];
                const [fileName, condition] = match[1].split(' if ');
                log('Found include : ' + match[0].trim());
                includesList.push({
                    parentFileName: parent,
                    line: line,
                    condition: condition ? parseCondition(condition) : '',
                    fileName: fileName,
                    subIncludes: [],
                    content: ""
                });
            }
            resolve(includesList);
        })
    }

    function resolveFileName(fileName, context) {
        return new Promise((resolve, reject) => {
            loader.resolve(context, fileName, (err, filePath) => {
                if (err || filePath === undefined) {
                    reject(new Error("Could not resolve " + fileName + ". err =" + err));
                }
                resolve(filePath);
            })
        });
    }

    function readFile(fileName, context) {
        return new Promise((resolve, reject) => {
            resolveFileName(fileName, context)
                .then((filePath) => {
                    if (filesCache.has(filePath)) {
                        //We already read this file from another include
                        log("file " + filePath + " was already read. Using cached data");
                        resolve(filesCache.get(filePath));
                    } else {
                        loader.addDependency(filePath);
                        fs.readFile(filePath, 'utf-8', (err, result) => {
                            if (err) {
                                reject(new Error("Could not read file " + filePath + ". err =" + err));
                            }
                            const fileData = {
                                content: result,
                                context: path.dirname(filePath),
                                path: filePath
                            };
                            filesCache.set(filePath, fileData);
                            resolve(fileData);
                        });
                    }
                })
                .catch((e)=>reject(e));
        })
    }

    function parseCondition(conditionString) {
        try {
            const ast = acorn.parse(conditionString);
            return buildConditionFromAST(ast.body[0].expression);
        }
        catch (e) {
            throw (new Error("Could not parse condition " + conditionString + ": " + e));
        }
    }

    function buildConditionFromAST(node) {
        switch (node.type) {
            case "Identifier":
                return `options.${node.name}`;
            case "Literal":
                return node.raw;
            case "UnaryExpression":
                return `${node.operator}(${buildConditionFromAST(node.argument)})`;
            case "BinaryExpression":
            case "LogicalExpression":
                return `(${buildConditionFromAST(node.left)}${node.operator}${buildConditionFromAST(node.right)})`;
            default :
                throw(new Error("unsupported condition"));
        }
    }

    function replaceContent(content, dependencyTree) {
        dependencyTree.forEach((include) => {
            include.content = replaceContent(include.content, include.subIncludes);
            if (include.condition === "") {
                content = content.replace(include.line, include.content);
            } else {
                const conditionalChunk = `\${${include.condition}?\`${include.content}\`:""}`;
                content = content.replace(include.line, conditionalChunk);
            }
        });
        return content;
    }

    function createMethod(content) {
        let resultFunction = `(options) => \`${content}\``;
        if (options.es5) {
            resultFunction = transformToES5(resultFunction);
        }
        return `module.exports = ${resultFunction}`
    }

    function transformToES5(content) {
        return babel.transform(content, {
            plugins: ['transform-es2015-template-literals', 'transform-es2015-arrow-functions'],
            babelrc: false,
            ast: false,
            compact: true,
            minified: true
        }).code;
    }
};

