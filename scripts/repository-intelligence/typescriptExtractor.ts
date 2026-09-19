import { createHash } from "node:crypto";
import ts from "typescript";
import type {
  IndexedExport,
  IndexedImport,
  IndexedSourceSpan,
  IndexedSymbol,
  IndexedSymbolKind,
} from "./types.ts";

interface RawSymbol {
  readonly name: string;
  readonly qualifiedName: string;
  readonly kind: IndexedSymbolKind;
  readonly isExported: boolean;
  readonly sourceSpan: IndexedSourceSpan;
  readonly identityBase: string;
  readonly signature: string;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export interface TypeScriptExtraction {
  readonly symbols: readonly IndexedSymbol[];
  readonly imports: readonly IndexedImport[];
  readonly exports: readonly IndexedExport[];
  readonly reExports: readonly IndexedExport[];
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) || []).some((modifier) => modifier.kind === kind);
}

function nodeNameText(name: ts.PropertyName | ts.BindingName | ts.ModuleName | undefined, sourceFile: ts.SourceFile): string | undefined {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return name.getText(sourceFile);
}

function declarationName(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)
    || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)) {
    return nodeNameText(node.name, sourceFile);
  }
  if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)
    || ts.isPropertyDeclaration(node) || ts.isMethodSignature(node) || ts.isPropertySignature(node)) {
    return nodeNameText(node.name, sourceFile);
  }
  if (ts.isConstructorDeclaration(node)) return "constructor";
  return undefined;
}

function sourceSpan(node: ts.Node, sourceFile: ts.SourceFile): IndexedSourceSpan {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    startLine: start.line + 1,
    endLine: end.line + 1,
    startColumn: start.character + 1,
    endColumn: end.character + 1,
  };
}

function normalizeSignature(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function declarationSignature(node: ts.Node, sourceFile: ts.SourceFile): string {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node)) {
    const parameters = node.parameters.map((parameter) => normalizeSignature(parameter.getText(sourceFile))).join(",");
    const typeParameters = "typeParameters" in node && node.typeParameters
      ? normalizeSignature(node.typeParameters.map((parameter) => parameter.getText(sourceFile)).join(","))
      : "";
    const returnType = "type" in node && node.type ? normalizeSignature(node.type.getText(sourceFile)) : "";
    return `${node.kind}|${typeParameters}|${parameters}|${returnType}`;
  }
  if (ts.isVariableDeclaration(node)) return `variable|${nodeNameText(node.name, sourceFile) || "binding"}`;
  return `${node.kind}|${declarationName(node, sourceFile) || "anonymous"}`;
}

function symbolKind(node: ts.Node): IndexedSymbolKind | undefined {
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isModuleDeclaration(node)) return "namespace";
  if (ts.isVariableDeclaration(node)) {
    const declarationList = node.parent;
    if (ts.isVariableDeclarationList(declarationList)) {
      if ((declarationList.flags & ts.NodeFlags.Const) !== 0) return "const";
      if ((declarationList.flags & ts.NodeFlags.Let) !== 0) return "let";
    }
    return "var";
  }
  if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)
    || ts.isMethodSignature(node)) return "method";
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) return "property";
  return undefined;
}

function bindingNames(name: ts.BindingName, sourceFile: ts.SourceFile): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  const names: string[] = [];
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) names.push(...bindingNames(element.name, sourceFile));
  }
  return names.length > 0 ? names : [name.getText(sourceFile)];
}

function declaredNames(statement: ts.Statement, sourceFile: ts.SourceFile): string[] {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) => bindingNames(declaration.name, sourceFile));
  }
  const name = declarationName(statement, sourceFile);
  return name ? [name] : [];
}

function collectImportFacts(sourceFile: ts.SourceFile): IndexedImport[] {
  const imports: IndexedImport[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const importedNames: string[] = [];
      const clause = statement.importClause;
      if (clause?.name) importedNames.push("default");
      if (clause?.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) importedNames.push(`* as ${clause.namedBindings.name.text}`);
        else importedNames.push(...clause.namedBindings.elements.map((element) => element.propertyName?.text || element.name.text));
      }
      const namedBindingsTypeOnly = clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
        ? clause.namedBindings.elements.some((element) => element.isTypeOnly)
        : false;
      imports.push({
        moduleSpecifier: statement.moduleSpecifier.text,
        importedNames: [...new Set(importedNames)].sort((left, right) => compareText(left, right)),
        isTypeOnly: Boolean(clause?.isTypeOnly || namedBindingsTypeOnly),
      });
    } else if (ts.isImportEqualsDeclaration(statement) && ts.isExternalModuleReference(statement.moduleReference)
      && ts.isStringLiteral(statement.moduleReference.expression)) {
      imports.push({
        moduleSpecifier: statement.moduleReference.expression.text,
        importedNames: [statement.name.text],
        isTypeOnly: false,
      });
    }
  }
  return imports.sort((left, right) => compareText(`${left.moduleSpecifier}|${left.importedNames.join(",")}`, `${right.moduleSpecifier}|${right.importedNames.join(",")}`));
}

function collectExportFacts(sourceFile: ts.SourceFile): IndexedExport[] {
  const exports: IndexedExport[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      const moduleSpecifier = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : undefined;
      if (!statement.exportClause) {
        if (moduleSpecifier) {
          exports.push({ name: "*", exportedName: "*", kind: "re-export", moduleSpecifier, isTypeOnly: statement.isTypeOnly });
        }
        continue;
      }
      if (ts.isNamespaceExport(statement.exportClause)) {
        exports.push({
          name: statement.exportClause.name.text,
          exportedName: statement.exportClause.name.text,
          kind: moduleSpecifier ? "re-export" : "local",
          moduleSpecifier,
          isTypeOnly: statement.isTypeOnly,
        });
        continue;
      }
      for (const specifier of statement.exportClause.elements) {
        exports.push({
          name: specifier.propertyName?.text || specifier.name.text,
          exportedName: specifier.name.text,
          kind: moduleSpecifier ? "re-export" : "local",
          moduleSpecifier,
          isTypeOnly: statement.isTypeOnly || specifier.isTypeOnly,
        });
      }
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      exports.push({ name: statement.expression.getText(sourceFile), exportedName: "default", kind: "default", isTypeOnly: false });
      continue;
    }
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    const names = declaredNames(statement, sourceFile);
    const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
    if (isDefault && names.length === 0) {
      exports.push({ name: "default", exportedName: "default", kind: "default", isTypeOnly: false });
    }
    for (const name of names) {
      exports.push({ name, exportedName: isDefault ? "default" : name, kind: isDefault ? "default" : "local", isTypeOnly: false });
    }
  }
  return exports.sort((left, right) => compareText(`${left.exportedName}|${left.moduleSpecifier || ""}|${left.name}`, `${right.exportedName}|${right.moduleSpecifier || ""}|${right.name}`));
}

function collectRawSymbols(sourceFile: ts.SourceFile, exports: readonly IndexedExport[], repositoryPath: string): RawSymbol[] {
  const explicitlyExported = new Set(exports.filter((entry) => !entry.moduleSpecifier).map((entry) => entry.name));
  const rawSymbols: RawSymbol[] = [];

  const add = (node: ts.Node, prefix: readonly string[], exported: boolean) => {
    const kind = symbolKind(node);
    const name = declarationName(node, sourceFile);
    if (!kind || !name) return;
    const qualifiedName = [...prefix, name].join(".");
    rawSymbols.push({
      name,
      qualifiedName,
      kind,
      isExported: exported || explicitlyExported.has(name),
      sourceSpan: sourceSpan(node, sourceFile),
      identityBase: `symbol:${repositoryPath}#${qualifiedName}:${kind}`,
      signature: declarationSignature(node, sourceFile),
    });
  };

  const collectInterfaceMembers = (node: ts.InterfaceDeclaration, prefix: readonly string[]) => {
    for (const member of node.members) add(member, prefix, false);
  };

  const collectClassMembers = (node: ts.ClassDeclaration, prefix: readonly string[]) => {
    for (const member of node.members) add(member, prefix, false);
  };

  const collectStatements = (statements: readonly ts.Statement[], prefix: readonly string[]) => {
    for (const statement of statements) {
      if (ts.isVariableStatement(statement)) {
        const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
        for (const declaration of statement.declarationList.declarations) {
          for (const name of bindingNames(declaration.name, sourceFile)) {
            if (name === declaration.name.getText(sourceFile)) add(declaration, prefix, exported);
            else {
              const synthetic = declaration;
              rawSymbols.push({
                name,
                qualifiedName: [...prefix, name].join("."),
                kind: symbolKind(declaration) || "var",
                isExported: exported || explicitlyExported.has(name),
                sourceSpan: sourceSpan(synthetic, sourceFile),
                identityBase: `symbol:${repositoryPath}#${[...prefix, name].join(".")}:${symbolKind(declaration) || "var"}`,
                signature: `binding|${name}`,
              });
            }
          }
        }
      } else if (ts.isClassDeclaration(statement)) {
        add(statement, prefix, hasModifier(statement, ts.SyntaxKind.ExportKeyword));
        const name = declarationName(statement, sourceFile);
        if (name) collectClassMembers(statement, [...prefix, name]);
      } else if (ts.isInterfaceDeclaration(statement)) {
        add(statement, prefix, hasModifier(statement, ts.SyntaxKind.ExportKeyword));
        const name = declarationName(statement, sourceFile);
        if (name) collectInterfaceMembers(statement, [...prefix, name]);
      } else if (ts.isFunctionDeclaration(statement) || ts.isTypeAliasDeclaration(statement)
        || ts.isEnumDeclaration(statement)) {
        add(statement, prefix, hasModifier(statement, ts.SyntaxKind.ExportKeyword));
      } else if (ts.isModuleDeclaration(statement)) {
        add(statement, prefix, hasModifier(statement, ts.SyntaxKind.ExportKeyword));
        const name = declarationName(statement, sourceFile);
        if (name && statement.body && ts.isModuleBlock(statement.body)) collectStatements(statement.body.statements, [...prefix, name]);
      }
    }
  };

  collectStatements(sourceFile.statements, []);
  return rawSymbols;
}

function finalizeSymbols(rawSymbols: readonly RawSymbol[]): IndexedSymbol[] {
  const groups = new Map<string, RawSymbol[]>();
  for (const symbol of rawSymbols) {
    const group = groups.get(symbol.identityBase) || [];
    group.push(symbol);
    groups.set(symbol.identityBase, group);
  }
  const symbols: IndexedSymbol[] = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) => compareText(`${left.signature}|${left.sourceSpan.startLine}`, `${right.signature}|${right.sourceSpan.startLine}`));
    const usedIds = new Map<string, number>();
    for (const symbol of ordered) {
      const digest = createHash("sha256").update(symbol.signature).digest("hex").slice(0, 12);
      const baseId = group.length > 1 ? `${symbol.identityBase}:${digest}` : symbol.identityBase;
      const occurrence = (usedIds.get(baseId) || 0) + 1;
      usedIds.set(baseId, occurrence);
      const id = occurrence === 1 ? baseId : `${baseId}-${occurrence}`;
      symbols.push({
        id,
        name: symbol.name,
        qualifiedName: symbol.qualifiedName,
        kind: symbol.kind,
        isExported: symbol.isExported,
        sourceSpan: symbol.sourceSpan,
      });
    }
  }
  return symbols.sort((left, right) => compareText(left.id, right.id));
}

export function extractTypeScriptFacts(repositoryPath: string, contents: string): TypeScriptExtraction {
  const lowerPath = repositoryPath.toLowerCase();
  const scriptKind = lowerPath.endsWith(".tsx") ? ts.ScriptKind.TSX : lowerPath.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(repositoryPath, contents, ts.ScriptTarget.Latest, true, scriptKind);
  const exports = collectExportFacts(sourceFile);
  const symbols = finalizeSymbols(collectRawSymbols(sourceFile, exports, repositoryPath));
  const imports = collectImportFacts(sourceFile);
  return {
    symbols,
    imports,
    exports,
    reExports: exports.filter((entry) => entry.kind === "re-export"),
  };
}
