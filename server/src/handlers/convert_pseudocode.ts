import { db } from '../db';
import { conversionRequestsTable, conversionResultsTable, errorLogsTable } from '../db/schema';
import { type CreateConversionRequestInput, type ConversionResponse, type ConversionResult, supportedLanguages } from '../schema';

// Pseudocode parsing and code generation logic
interface ParsedPseudocode {
  statements: Statement[];
  variables: Set<string>;
  hasInput: boolean;
  hasOutput: boolean;
}

interface Statement {
  type: 'assignment' | 'input' | 'output' | 'if' | 'while' | 'for' | 'comment' | 'start' | 'end';
  content: string;
  condition?: string;
  body?: Statement[];
  elseBody?: Statement[];
  variable?: string;
  value?: string;
  message?: string;
  loopVariable?: string;
  startValue?: string;
  endValue?: string;
  step?: string;
}

// Enhanced pseudocode parser
const parsePseudocode = (pseudocode: string): ParsedPseudocode => {
  const lines = pseudocode.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const statements: Statement[] = [];
  const variables = new Set<string>();
  let hasInput = false;
  let hasOutput = false;
  let i = 0;

  const parseBlock = (endTokens: string[] = []): Statement[] => {
    const blockStatements: Statement[] = [];
    
    while (i < lines.length) {
      const line = lines[i].toUpperCase();
      const originalLine = lines[i];
      
      // Check for end tokens
      if (endTokens.some(token => line.startsWith(token))) {
        break;
      }
      
      // START/END statements
      if (line === 'START' || line === 'BEGIN') {
        blockStatements.push({ type: 'start', content: originalLine });
      } else if (line === 'END' || line === 'STOP') {
        blockStatements.push({ type: 'end', content: originalLine });
      }
      // Comments
      else if (line.startsWith('//') || line.startsWith('#') || line.startsWith('/*')) {
        blockStatements.push({ type: 'comment', content: originalLine });
      }
      // Input statements
      else if (line.startsWith('INPUT ') || line.startsWith('READ ') || line.startsWith('GET ')) {
        hasInput = true;
        const variable = originalLine.split(/\s+/)[1];
        variables.add(variable);
        blockStatements.push({ 
          type: 'input', 
          content: originalLine, 
          variable: variable 
        });
      }
      // Output statements
      else if (line.startsWith('OUTPUT ') || line.startsWith('PRINT ') || line.startsWith('DISPLAY ') || line.startsWith('WRITE ')) {
        hasOutput = true;
        const message = originalLine.substring(originalLine.indexOf(' ') + 1);
        blockStatements.push({ 
          type: 'output', 
          content: originalLine, 
          message: message 
        });
      }
      // Assignment statements
      else if (originalLine.includes('=') || originalLine.includes('<-') || originalLine.includes(':=')) {
        const parts = originalLine.split(/\s*(?:=|<-|:=)\s*/);
        if (parts.length === 2) {
          const variable = parts[0].trim();
          const value = parts[1].trim();
          variables.add(variable);
          blockStatements.push({ 
            type: 'assignment', 
            content: originalLine, 
            variable: variable, 
            value: value 
          });
        }
      }
      // IF statements
      else if (line.startsWith('IF ')) {
        const condition = originalLine.substring(3, originalLine.indexOf(' THEN'));
        i++; // Move to next line
        const ifBody = parseBlock(['ELSE', 'END IF', 'ENDIF']);
        
        let elseBody: Statement[] = [];
        if (i < lines.length && lines[i].toUpperCase().startsWith('ELSE')) {
          i++; // Skip ELSE line
          elseBody = parseBlock(['END IF', 'ENDIF']);
        }
        
        blockStatements.push({
          type: 'if',
          content: originalLine,
          condition: condition,
          body: ifBody,
          elseBody: elseBody
        });
        
        // Skip END IF
        if (i < lines.length && (lines[i].toUpperCase().startsWith('END IF') || lines[i].toUpperCase().startsWith('ENDIF'))) {
          // Don't increment i here, let the main loop handle it
        }
      }
      // WHILE loops
      else if (line.startsWith('WHILE ')) {
        const condition = originalLine.substring(6);
        i++; // Move to next line
        const body = parseBlock(['END WHILE', 'ENDWHILE']);
        
        blockStatements.push({
          type: 'while',
          content: originalLine,
          condition: condition,
          body: body
        });
        
        // Skip END WHILE
        if (i < lines.length && (lines[i].toUpperCase().startsWith('END WHILE') || lines[i].toUpperCase().startsWith('ENDWHILE'))) {
          // Don't increment i here, let the main loop handle it
        }
      }
      // FOR loops
      else if (line.startsWith('FOR ')) {
        // Parse FOR loop: FOR i = 1 TO 10 or FOR i FROM 1 TO 10
        const forParts = originalLine.match(/FOR\s+(\w+)\s+(?:=|FROM)\s+(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+))?$/i);
        if (forParts) {
          const loopVariable = forParts[1];
          const startValue = forParts[2];
          const endValue = forParts[3];
          const step = forParts[4] || '1';
          
          variables.add(loopVariable);
          i++; // Move to next line
          const body = parseBlock(['NEXT', 'END FOR', 'ENDFOR']);
          
          blockStatements.push({
            type: 'for',
            content: originalLine,
            loopVariable: loopVariable,
            startValue: startValue,
            endValue: endValue,
            step: step,
            body: body
          });
          
          // Skip NEXT/END FOR
          if (i < lines.length && (lines[i].toUpperCase().startsWith('NEXT') || lines[i].toUpperCase().startsWith('END FOR') || lines[i].toUpperCase().startsWith('ENDFOR'))) {
            // Don't increment i here, let the main loop handle it
          }
        }
      }
      
      i++;
    }
    
    return blockStatements;
  };

  statements.push(...parseBlock());
  
  return {
    statements,
    variables,
    hasInput,
    hasOutput
  };
};

// Code generators for each language
const generatePythonCode = (parsed: ParsedPseudocode): string => {
  let code = '# Generated Python code from pseudocode\n\n';
  
  const generateStatements = (statements: Statement[], indent = 0): string => {
    let result = '';
    const indentStr = '    '.repeat(indent);
    
    for (const stmt of statements) {
      switch (stmt.type) {
        case 'comment':
          result += `${indentStr}# ${stmt.content}\n`;
          break;
        case 'input':
          result += `${indentStr}${stmt.variable} = input("Enter ${stmt.variable}: ")\n`;
          break;
        case 'output':
          const message = stmt.message?.replace(/'/g, '"') || '';
          if (message.includes('"') && !message.startsWith('"')) {
            // Variable or expression
            result += `${indentStr}print(${message})\n`;
          } else {
            // String literal
            result += `${indentStr}print(${message})\n`;
          }
          break;
        case 'assignment':
          result += `${indentStr}${stmt.variable} = ${stmt.value}\n`;
          break;
        case 'if':
          result += `${indentStr}if ${stmt.condition}:\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          if (stmt.elseBody && stmt.elseBody.length > 0) {
            result += `${indentStr}else:\n`;
            result += generateStatements(stmt.elseBody, indent + 1);
          }
          break;
        case 'while':
          result += `${indentStr}while ${stmt.condition}:\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          break;
        case 'for':
          result += `${indentStr}for ${stmt.loopVariable} in range(${stmt.startValue}, ${stmt.endValue} + 1, ${stmt.step}):\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          break;
      }
    }
    
    return result;
  };
  
  code += generateStatements(parsed.statements);
  return code;
};

const generateJavaScriptCode = (parsed: ParsedPseudocode): string => {
  let code = '// Generated JavaScript code from pseudocode\n\n';
  
  if (parsed.hasInput) {
    code += 'const readline = require(\'readline\');\n';
    code += 'const rl = readline.createInterface({ input: process.stdin, output: process.stdout });\n\n';
  }
  
  const generateStatements = (statements: Statement[], indent = 0): string => {
    let result = '';
    const indentStr = '    '.repeat(indent);
    
    for (const stmt of statements) {
      switch (stmt.type) {
        case 'comment':
          result += `${indentStr}// ${stmt.content}\n`;
          break;
        case 'input':
          result += `${indentStr}let ${stmt.variable} = prompt("Enter ${stmt.variable}:");\n`;
          break;
        case 'output':
          const message = stmt.message || '';
          result += `${indentStr}console.log(${message});\n`;
          break;
        case 'assignment':
          result += `${indentStr}let ${stmt.variable} = ${stmt.value};\n`;
          break;
        case 'if':
          result += `${indentStr}if (${stmt.condition}) {\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          if (stmt.elseBody && stmt.elseBody.length > 0) {
            result += `${indentStr}else {\n`;
            result += generateStatements(stmt.elseBody, indent + 1);
            result += `${indentStr}}\n`;
          }
          break;
        case 'while':
          result += `${indentStr}while (${stmt.condition}) {\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          break;
        case 'for':
          result += `${indentStr}for (let ${stmt.loopVariable} = ${stmt.startValue}; ${stmt.loopVariable} <= ${stmt.endValue}; ${stmt.loopVariable} += ${stmt.step}) {\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          break;
      }
    }
    
    return result;
  };
  
  code += generateStatements(parsed.statements);
  return code;
};

const generateJavaCode = (parsed: ParsedPseudocode): string => {
  let code = '// Generated Java code from pseudocode\n\n';
  code += 'import java.util.Scanner;\n\n';
  code += 'public class PseudocodeConverter {\n';
  code += '    public static void main(String[] args) {\n';
  
  if (parsed.hasInput) {
    code += '        Scanner scanner = new Scanner(System.in);\n';
  }
  
  const generateStatements = (statements: Statement[], indent = 2): string => {
    let result = '';
    const indentStr = '    '.repeat(indent);
    
    for (const stmt of statements) {
      switch (stmt.type) {
        case 'comment':
          result += `${indentStr}// ${stmt.content}\n`;
          break;
        case 'input':
          result += `${indentStr}System.out.print("Enter ${stmt.variable}: ");\n`;
          result += `${indentStr}String ${stmt.variable} = scanner.nextLine();\n`;
          break;
        case 'output':
          const message = stmt.message || '';
          result += `${indentStr}System.out.println(${message});\n`;
          break;
        case 'assignment':
          result += `${indentStr}String ${stmt.variable} = ${stmt.value};\n`;
          break;
        case 'if':
          result += `${indentStr}if (${stmt.condition}) {\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          if (stmt.elseBody && stmt.elseBody.length > 0) {
            result += `${indentStr}else {\n`;
            result += generateStatements(stmt.elseBody, indent + 1);
            result += `${indentStr}}\n`;
          }
          break;
        case 'while':
          result += `${indentStr}while (${stmt.condition}) {\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          break;
        case 'for':
          result += `${indentStr}for (int ${stmt.loopVariable} = ${stmt.startValue}; ${stmt.loopVariable} <= ${stmt.endValue}; ${stmt.loopVariable} += ${stmt.step}) {\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          break;
      }
    }
    
    return result;
  };
  
  code += generateStatements(parsed.statements);
  code += '    }\n';
  code += '}\n';
  
  return code;
};

const generateCSharpCode = (parsed: ParsedPseudocode): string => {
  let code = '// Generated C# code from pseudocode\n\n';
  code += 'using System;\n\n';
  code += 'class Program\n{\n';
  code += '    static void Main()\n    {\n';
  
  const generateStatements = (statements: Statement[], indent = 2): string => {
    let result = '';
    const indentStr = '    '.repeat(indent);
    
    for (const stmt of statements) {
      switch (stmt.type) {
        case 'comment':
          result += `${indentStr}// ${stmt.content}\n`;
          break;
        case 'input':
          result += `${indentStr}Console.Write("Enter ${stmt.variable}: ");\n`;
          result += `${indentStr}string ${stmt.variable} = Console.ReadLine();\n`;
          break;
        case 'output':
          const message = stmt.message || '';
          result += `${indentStr}Console.WriteLine(${message});\n`;
          break;
        case 'assignment':
          result += `${indentStr}var ${stmt.variable} = ${stmt.value};\n`;
          break;
        case 'if':
          result += `${indentStr}if (${stmt.condition})\n${indentStr}{\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          if (stmt.elseBody && stmt.elseBody.length > 0) {
            result += `${indentStr}else\n${indentStr}{\n`;
            result += generateStatements(stmt.elseBody, indent + 1);
            result += `${indentStr}}\n`;
          }
          break;
        case 'while':
          result += `${indentStr}while (${stmt.condition})\n${indentStr}{\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          break;
        case 'for':
          result += `${indentStr}for (int ${stmt.loopVariable} = ${stmt.startValue}; ${stmt.loopVariable} <= ${stmt.endValue}; ${stmt.loopVariable} += ${stmt.step})\n${indentStr}{\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          break;
      }
    }
    
    return result;
  };
  
  code += generateStatements(parsed.statements);
  code += '    }\n';
  code += '}\n';
  
  return code;
};

const generateCppCode = (parsed: ParsedPseudocode): string => {
  let code = '// Generated C++ code from pseudocode\n\n';
  code += '#include <iostream>\n';
  code += '#include <string>\n';
  code += 'using namespace std;\n\n';
  code += 'int main() {\n';
  
  const generateStatements = (statements: Statement[], indent = 1): string => {
    let result = '';
    const indentStr = '    '.repeat(indent);
    
    for (const stmt of statements) {
      switch (stmt.type) {
        case 'comment':
          result += `${indentStr}// ${stmt.content}\n`;
          break;
        case 'input':
          result += `${indentStr}cout << "Enter ${stmt.variable}: ";\n`;
          result += `${indentStr}string ${stmt.variable};\n`;
          result += `${indentStr}cin >> ${stmt.variable};\n`;
          break;
        case 'output':
          const message = stmt.message || '';
          result += `${indentStr}cout << ${message} << endl;\n`;
          break;
        case 'assignment':
          result += `${indentStr}auto ${stmt.variable} = ${stmt.value};\n`;
          break;
        case 'if':
          result += `${indentStr}if (${stmt.condition}) {\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          if (stmt.elseBody && stmt.elseBody.length > 0) {
            result += `${indentStr}else {\n`;
            result += generateStatements(stmt.elseBody, indent + 1);
            result += `${indentStr}}\n`;
          }
          break;
        case 'while':
          result += `${indentStr}while (${stmt.condition}) {\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          break;
        case 'for':
          result += `${indentStr}for (int ${stmt.loopVariable} = ${stmt.startValue}; ${stmt.loopVariable} <= ${stmt.endValue}; ${stmt.loopVariable} += ${stmt.step}) {\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          break;
      }
    }
    
    return result;
  };
  
  code += generateStatements(parsed.statements);
  code += '    return 0;\n';
  code += '}\n';
  
  return code;
};

const generateGoCode = (parsed: ParsedPseudocode): string => {
  let code = '// Generated Go code from pseudocode\n\n';
  code += 'package main\n\n';
  code += 'import (\n';
  code += '    "fmt"\n';
  if (parsed.hasInput) {
    code += '    "bufio"\n';
    code += '    "os"\n';
    code += '    "strings"\n';
  }
  code += ')\n\n';
  code += 'func main() {\n';
  
  if (parsed.hasInput) {
    code += '    reader := bufio.NewReader(os.Stdin)\n';
  }
  
  const generateStatements = (statements: Statement[], indent = 1): string => {
    let result = '';
    const indentStr = '    '.repeat(indent);
    
    for (const stmt of statements) {
      switch (stmt.type) {
        case 'comment':
          result += `${indentStr}// ${stmt.content}\n`;
          break;
        case 'input':
          result += `${indentStr}fmt.Print("Enter ${stmt.variable}: ")\n`;
          result += `${indentStr}${stmt.variable}, _ := reader.ReadString('\\n')\n`;
          result += `${indentStr}${stmt.variable} = strings.TrimSpace(${stmt.variable})\n`;
          break;
        case 'output':
          const message = stmt.message || '';
          result += `${indentStr}fmt.Println(${message})\n`;
          break;
        case 'assignment':
          result += `${indentStr}${stmt.variable} := ${stmt.value}\n`;
          break;
        case 'if':
          result += `${indentStr}if ${stmt.condition} {\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          if (stmt.elseBody && stmt.elseBody.length > 0) {
            result += `${indentStr}else {\n`;
            result += generateStatements(stmt.elseBody, indent + 1);
            result += `${indentStr}}\n`;
          }
          break;
        case 'while':
          result += `${indentStr}for ${stmt.condition} {\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          break;
        case 'for':
          result += `${indentStr}for ${stmt.loopVariable} := ${stmt.startValue}; ${stmt.loopVariable} <= ${stmt.endValue}; ${stmt.loopVariable} += ${stmt.step} {\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          break;
      }
    }
    
    return result;
  };
  
  code += generateStatements(parsed.statements);
  code += '}\n';
  
  return code;
};

const generateRustCode = (parsed: ParsedPseudocode): string => {
  let code = '// Generated Rust code from pseudocode\n\n';
  if (parsed.hasInput) {
    code += 'use std::io;\n\n';
  }
  code += 'fn main() {\n';
  
  const generateStatements = (statements: Statement[], indent = 1): string => {
    let result = '';
    const indentStr = '    '.repeat(indent);
    
    for (const stmt of statements) {
      switch (stmt.type) {
        case 'comment':
          result += `${indentStr}// ${stmt.content}\n`;
          break;
        case 'input':
          result += `${indentStr}println!("Enter ${stmt.variable}: ");\n`;
          result += `${indentStr}let mut ${stmt.variable} = String::new();\n`;
          result += `${indentStr}io::stdin().read_line(&mut ${stmt.variable}).expect("Failed to read line");\n`;
          result += `${indentStr}let ${stmt.variable} = ${stmt.variable}.trim();\n`;
          break;
        case 'output':
          const message = stmt.message || '';
          result += `${indentStr}println!("{}", ${message});\n`;
          break;
        case 'assignment':
          result += `${indentStr}let ${stmt.variable} = ${stmt.value};\n`;
          break;
        case 'if':
          result += `${indentStr}if ${stmt.condition} {\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          if (stmt.elseBody && stmt.elseBody.length > 0) {
            result += `${indentStr}else {\n`;
            result += generateStatements(stmt.elseBody, indent + 1);
            result += `${indentStr}}\n`;
          }
          break;
        case 'while':
          result += `${indentStr}while ${stmt.condition} {\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          break;
        case 'for':
          result += `${indentStr}for ${stmt.loopVariable} in ${stmt.startValue}..=${stmt.endValue} {\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}}\n`;
          break;
      }
    }
    
    return result;
  };
  
  code += generateStatements(parsed.statements);
  code += '}\n';
  
  return code;
};

// Enhanced code conversion function
const convertToLanguage = async (pseudocode: string, language: string): Promise<{ code: string; executionTime: number }> => {
  const startTime = Date.now();
  
  try {
    // Parse the pseudocode
    const parsed = parsePseudocode(pseudocode);
    
    if (parsed.statements.length === 0) {
      throw new Error('No valid pseudocode statements found');
    }
    
    let code = '';
    switch (language) {
      case 'python':
        code = generatePythonCode(parsed);
        break;
      case 'javascript':
        code = generateJavaScriptCode(parsed);
        break;
      case 'java':
        code = generateJavaCode(parsed);
        break;
      case 'csharp':
        code = generateCSharpCode(parsed);
        break;
      case 'cpp':
        code = generateCppCode(parsed);
        break;
      case 'go':
        code = generateGoCode(parsed);
        break;
      case 'rust':
        code = generateRustCode(parsed);
        break;
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
    
    const executionTime = Math.max(1, Date.now() - startTime);
    return { code, executionTime };
  } catch (error) {
    const executionTime = Math.max(1, Date.now() - startTime);
    throw error;
  }
};

// Enhanced flowchart generation function
const generateFlowchart = async (pseudocode: string): Promise<{ code: string; executionTime: number }> => {
  const startTime = Date.now();
  
  try {
    const parsed = parsePseudocode(pseudocode);
    
    if (parsed.statements.length === 0) {
      throw new Error('No valid pseudocode statements found for flowchart generation');
    }
    
    let flowchart = 'graph TD\n';
    let nodeId = 1;
    const nodeMap = new Map<string, number>();
    
    const generateFlowchartNodes = (statements: Statement[], parentId?: number): number => {
      let currentId = parentId || nodeId++;
      let lastId = currentId;
      
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        const currentNodeId = nodeId++;
        
        switch (stmt.type) {
          case 'start':
            flowchart += `    A${currentNodeId}([Start])\n`;
            if (lastId !== currentNodeId) {
              flowchart += `    A${lastId} --> A${currentNodeId}\n`;
            }
            lastId = currentNodeId;
            break;
            
          case 'end':
            flowchart += `    A${currentNodeId}([End])\n`;
            flowchart += `    A${lastId} --> A${currentNodeId}\n`;
            lastId = currentNodeId;
            break;
            
          case 'input':
            flowchart += `    A${currentNodeId}[/Input: ${stmt.variable}/]\n`;
            if (lastId !== currentNodeId) {
              flowchart += `    A${lastId} --> A${currentNodeId}\n`;
            }
            lastId = currentNodeId;
            break;
            
          case 'output':
            const outputText = stmt.message?.substring(0, 30) || 'Output';
            flowchart += `    A${currentNodeId}[/Output: ${outputText}/]\n`;
            if (lastId !== currentNodeId) {
              flowchart += `    A${lastId} --> A${currentNodeId}\n`;
            }
            lastId = currentNodeId;
            break;
            
          case 'assignment':
            flowchart += `    A${currentNodeId}[${stmt.variable} = ${stmt.value}]\n`;
            if (lastId !== currentNodeId) {
              flowchart += `    A${lastId} --> A${currentNodeId}\n`;
            }
            lastId = currentNodeId;
            break;
            
          case 'if':
            const conditionText = stmt.condition?.substring(0, 20) || 'condition';
            flowchart += `    A${currentNodeId}{${conditionText}?}\n`;
            if (lastId !== currentNodeId) {
              flowchart += `    A${lastId} --> A${currentNodeId}\n`;
            }
            
            // Generate IF body
            const ifBodyEndId = generateFlowchartNodes(stmt.body || [], currentNodeId);
            flowchart += `    A${currentNodeId} -->|Yes| A${ifBodyEndId}\n`;
            
            // Generate ELSE body if exists
            let elseBodyEndId = currentNodeId;
            if (stmt.elseBody && stmt.elseBody.length > 0) {
              elseBodyEndId = generateFlowchartNodes(stmt.elseBody, currentNodeId);
              flowchart += `    A${currentNodeId} -->|No| A${elseBodyEndId}\n`;
            } else {
              flowchart += `    A${currentNodeId} -->|No| A${nodeId}\n`;
              elseBodyEndId = nodeId++;
              flowchart += `    A${elseBodyEndId}[ ]\n`;
            }
            
            // Merge point
            const mergeId = nodeId++;
            flowchart += `    A${ifBodyEndId} --> A${mergeId}\n`;
            flowchart += `    A${elseBodyEndId} --> A${mergeId}\n`;
            flowchart += `    A${mergeId}[ ]\n`;
            
            lastId = mergeId;
            break;
            
          case 'while':
            const whileCondition = stmt.condition?.substring(0,20) || 'condition';
            flowchart += `    A${currentNodeId}{While ${whileCondition}?}\n`;
            if (lastId !== currentNodeId) {
              flowchart += `    A${lastId} --> A${currentNodeId}\n`;
            }
            
            // Generate loop body
            const loopBodyEndId = generateFlowchartNodes(stmt.body || [], currentNodeId);
            flowchart += `    A${currentNodeId} -->|Yes| A${loopBodyEndId}\n`;
            flowchart += `    A${loopBodyEndId} --> A${currentNodeId}\n`;
            flowchart += `    A${currentNodeId} -->|No| A${nodeId}\n`;
            
            lastId = nodeId++;
            flowchart += `    A${lastId}[ ]\n`;
            break;
            
          case 'for':
            const forText = `${stmt.loopVariable} = ${stmt.startValue} to ${stmt.endValue}`;
            flowchart += `    A${currentNodeId}{For ${forText}}\n`;
            if (lastId !== currentNodeId) {
              flowchart += `    A${lastId} --> A${currentNodeId}\n`;
            }
            
            // Generate loop body
            const forBodyEndId = generateFlowchartNodes(stmt.body || [], currentNodeId);
            flowchart += `    A${currentNodeId} --> A${forBodyEndId}\n`;
            flowchart += `    A${forBodyEndId} --> A${currentNodeId}\n`;
            flowchart += `    A${currentNodeId} --> A${nodeId}\n`;
            
            lastId = nodeId++;
            flowchart += `    A${lastId}[ ]\n`;
            break;
            
          default:
            // Skip unknown statement types
            continue;
        }
      }
      
      return lastId;
    };
    
    // Add start node if not present
    if (!parsed.statements.some(s => s.type === 'start')) {
      flowchart += '    A1([Start])\n';
      generateFlowchartNodes(parsed.statements, 1);
    } else {
      generateFlowchartNodes(parsed.statements);
    }
    
    // Add end node if not present
    if (!parsed.statements.some(s => s.type === 'end')) {
      const endId = nodeId++;
      flowchart += `    A${endId}([End])\n`;
    }
    
    const executionTime = Math.max(1, Date.now() - startTime);
    return { code: flowchart, executionTime };
  } catch (error) {
    const executionTime = Math.max(1, Date.now() - startTime);
    throw error;
  }
};

export const convertPseudocode = async (input: CreateConversionRequestInput): Promise<ConversionResponse> => {
  try {
    // Validate pseudocode input
    if (!input.pseudocode || input.pseudocode.trim().length === 0) {
      throw new Error('Pseudocode input is empty');
    }

    // Create conversion request
    const requestResult = await db.insert(conversionRequestsTable)
      .values({
        pseudocode: input.pseudocode,
        target_languages: JSON.stringify(input.target_languages),
        include_flowchart: input.include_flowchart,
        user_id: input.user_id || null,
        accessibility_mode: input.accessibility_mode,
        voice_enabled: input.voice_enabled,
        updated_at: new Date()
      })
      .returning()
      .execute();

    const request = requestResult[0];
    const results: ConversionResult[] = [];
    const errors = [];

    // Convert to each target language
    for (const language of input.target_languages) {
      try {
        const { code, executionTime } = await convertToLanguage(input.pseudocode, language);
        
        const resultData = await db.insert(conversionResultsTable)
          .values({
            request_id: request.id,
            language: language,
            output_type: 'code',
            generated_code: code,
            execution_time_ms: executionTime,
            success: true,
            error_message: null
          })
          .returning()
          .execute();

        results.push(resultData[0] as ConversionResult);
      } catch (error) {
        // Enhanced error handling with specific suggestions
        const errorMessage = error instanceof Error ? error.message : 'Unknown conversion error';
        let userFriendlyMessage = '';
        let fixSuggestions: string[] = [];
        let avoidSuggestions: string[] = [];
        let visualIndicators = 'error-highlight';
        let audioFeedback = 'conversion-failed';
        let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';

        if (errorMessage.includes('No valid pseudocode statements found')) {
          userFriendlyMessage = `Could not understand the pseudocode structure for ${language} conversion`;
          fixSuggestions = [
            'Use standard pseudocode keywords like START, END, IF, THEN, ELSE',
            'Check that each line contains a complete statement',
            'Try using simpler pseudocode constructs first',
            'Ensure proper indentation for nested blocks'
          ];
          avoidSuggestions = [
            'Do not use programming language-specific syntax',
            'Avoid mixing different pseudocode styles',
            'Do not leave incomplete statements'
          ];
          severity = 'high';
        } else if (errorMessage.includes('Unsupported language')) {
          userFriendlyMessage = `${language} is not currently supported for conversion`;
          fixSuggestions = [
            'Try selecting a different target language',
            'Choose from Python, JavaScript, Java, C#, C++, Go, or Rust'
          ];
          avoidSuggestions = [
            'Do not expect all programming languages to be supported'
          ];
          severity = 'low';
        } else {
          userFriendlyMessage = `Conversion to ${language} failed due to a parsing error`;
          fixSuggestions = [
            'Check your pseudocode for syntax errors',
            'Ensure all IF statements have matching END IF',
            'Verify that loops have proper start and end markers',
            'Try breaking complex logic into simpler steps'
          ];
          avoidSuggestions = [
            'Do not use ambiguous variable names',
            'Avoid deeply nested control structures',
            'Do not mix pseudocode with actual code syntax'
          ];
        }
        
        const errorData = await db.insert(errorLogsTable)
          .values({
            request_id: request.id,
            error_type: 'conversion_error',
            error_message: errorMessage,
            user_friendly_message: userFriendlyMessage,
            fix_suggestions: JSON.stringify(fixSuggestions),
            avoid_suggestions: JSON.stringify(avoidSuggestions),
            visual_indicators: visualIndicators,
            audio_feedback: audioFeedback,
            severity: severity
          })
          .returning()
          .execute();

        errors.push(errorData[0]);

        // Still create a failed result record
        const failedResult = await db.insert(conversionResultsTable)
          .values({
            request_id: request.id,
            language: language,
            output_type: 'code',
            generated_code: '',
            execution_time_ms: 0,
            success: false,
            error_message: errorMessage
          })
          .returning()
          .execute();

        results.push(failedResult[0] as ConversionResult);
      }
    }

    // Generate flowchart if requested
    if (input.include_flowchart) {
      try {
        const { code, executionTime } = await generateFlowchart(input.pseudocode);
        
        const flowchartResult = await db.insert(conversionResultsTable)
          .values({
            request_id: request.id,
            language: 'mermaid',
            output_type: 'flowchart',
            generated_code: code,
            execution_time_ms: executionTime,
            success: true,
            error_message: null
          })
          .returning()
          .execute();

        results.push(flowchartResult[0] as ConversionResult);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown flowchart error';
        let userFriendlyMessage = '';
        let fixSuggestions: string[] = [];
        let avoidSuggestions: string[] = [];

        if (errorMessage.includes('No valid pseudocode statements found')) {
          userFriendlyMessage = 'Could not generate flowchart due to unrecognized pseudocode structure';
          fixSuggestions = [
            'Use clear control flow statements (IF, WHILE, FOR)',
            'Include START and END markers in your pseudocode',
            'Ensure each step is on a separate line',
            'Use descriptive names for variables and conditions'
          ];
          avoidSuggestions = [
            'Avoid overly complex nested logic for flowcharts',
            'Do not use programming-specific constructs',
            'Avoid unclear or ambiguous step descriptions'
          ];
        } else {
          userFriendlyMessage = 'Flowchart generation encountered an unexpected error';
          fixSuggestions = [
            'Simplify the pseudocode structure',
            'Break down complex operations into smaller steps',
            'Use standard pseudocode conventions'
          ];
          avoidSuggestions = [
            'Avoid overly complex branching logic',
            'Do not use unconventional pseudocode syntax'
          ];
        }
        
        const errorData = await db.insert(errorLogsTable)
          .values({
            request_id: request.id,
            error_type: 'flowchart_error',
            error_message: errorMessage,
            user_friendly_message: userFriendlyMessage,
            fix_suggestions: JSON.stringify(fixSuggestions),
            avoid_suggestions: JSON.stringify(avoidSuggestions),
            visual_indicators: 'flowchart-error',
            audio_feedback: 'flowchart-failed',
            severity: 'medium'
          })
          .returning()
          .execute();

        errors.push(errorData[0]);
      }
    }

    // Parse JSON fields and return response
    return {
      request: {
        ...request,
        target_languages: JSON.parse(request.target_languages)
      },
      results: results,
      errors: errors.map(error => ({
        ...error,
        fix_suggestions: JSON.parse(error.fix_suggestions),
        avoid_suggestions: JSON.parse(error.avoid_suggestions)
      }))
    };
  } catch (error) {
    console.error('Pseudocode conversion failed:', error);
    throw error;
  }
};