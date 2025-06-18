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
  lineNumber?: number;
}

// Enhanced pseudocode parser with better error handling
const parsePseudocode = (pseudocode: string): ParsedPseudocode => {
  const lines = pseudocode.split('\n').map((line, index) => ({ 
    content: line.trim(), 
    number: index + 1 
  })).filter(line => line.content.length > 0);
  
  const statements: Statement[] = [];
  const variables = new Set<string>();
  let hasInput = false;
  let hasOutput = false;
  let i = 0;

  const parseBlock = (endTokens: string[] = []): Statement[] => {
    const blockStatements: Statement[] = [];
    
    while (i < lines.length) {
      const line = lines[i].content.toUpperCase();
      const originalLine = lines[i].content;
      const lineNumber = lines[i].number;
      
      // Check for end tokens first
      if (endTokens.length > 0) {
        for (const token of endTokens) {
          if (line === token || line.startsWith(token + ' ')) {
            return blockStatements;
          }
        }
      }
      
      // START/END statements
      if (line === 'START' || line === 'BEGIN') {
        blockStatements.push({ 
          type: 'start', 
          content: originalLine, 
          lineNumber 
        });
      } 
      else if (line === 'END' || line === 'STOP') {
        blockStatements.push({ 
          type: 'end', 
          content: originalLine, 
          lineNumber 
        });
      }
      // Comments
      else if (line.startsWith('//') || line.startsWith('#') || line.startsWith('/*')) {
        blockStatements.push({ 
          type: 'comment', 
          content: originalLine, 
          lineNumber 
        });
      }
      // Input statements
      else if (line.startsWith('INPUT ') || line.startsWith('READ ') || line.startsWith('GET ')) {
        hasInput = true;
        const parts = originalLine.split(/\s+/);
        if (parts.length >= 2) {
          const variable = parts[1];
          variables.add(variable);
          blockStatements.push({ 
            type: 'input', 
            content: originalLine, 
            variable: variable,
            lineNumber 
          });
        }
      }
      // Output statements
      else if (line.startsWith('OUTPUT ') || line.startsWith('PRINT ') || line.startsWith('DISPLAY ') || line.startsWith('WRITE ')) {
        hasOutput = true;
        const spaceIndex = originalLine.indexOf(' ');
        const message = spaceIndex >= 0 ? originalLine.substring(spaceIndex + 1) : '';
        blockStatements.push({ 
          type: 'output', 
          content: originalLine, 
          message: message,
          lineNumber 
        });
      }
      // Assignment statements - handle multiple assignment operators
      else if (originalLine.includes('=') || originalLine.includes('<-') || originalLine.includes(':=')) {
        let separator = '=';
        if (originalLine.includes('<-')) separator = '<-';
        else if (originalLine.includes(':=')) separator = ':=';
        
        const parts = originalLine.split(separator);
        if (parts.length === 2) {
          const variable = parts[0].trim();
          const value = parts[1].trim();
          
          // Handle SET keyword
          const cleanVariable = variable.startsWith('SET ') ? variable.substring(4) : variable;
          variables.add(cleanVariable);
          
          blockStatements.push({ 
            type: 'assignment', 
            content: originalLine, 
            variable: cleanVariable, 
            value: value,
            lineNumber 
          });
        }
      }
      // IF statements with better parsing
      else if (line.startsWith('IF ')) {
        const thenIndex = line.indexOf(' THEN');
        if (thenIndex > 0) {
          const condition = originalLine.substring(3, originalLine.toUpperCase().indexOf(' THEN'));
          i++; // Move to next line for IF body
          
          const ifBody = parseBlock(['ELSE IF', 'ELSEIF', 'ELSE', 'END IF', 'ENDIF']);
          let elseBody: Statement[] = [];
          
          // Handle ELSE IF and ELSE
          if (i < lines.length) {
            const currentLine = lines[i].content.toUpperCase();
            if (currentLine.startsWith('ELSE IF') || currentLine.startsWith('ELSEIF')) {
              // For now, treat ELSE IF as just ELSE (could be enhanced further)
              i++; // Skip ELSE IF line
              elseBody = parseBlock(['END IF', 'ENDIF']);
            } else if (currentLine.startsWith('ELSE')) {
              i++; // Skip ELSE line
              elseBody = parseBlock(['END IF', 'ENDIF']);
            }
          }
          
          blockStatements.push({
            type: 'if',
            content: originalLine,
            condition: condition,
            body: ifBody,
            elseBody: elseBody,
            lineNumber
          });
          
          // Skip END IF
          if (i < lines.length && 
              (lines[i].content.toUpperCase() === 'END IF' || 
               lines[i].content.toUpperCase() === 'ENDIF')) {
            i++; // Skip the END IF line
            continue; // Don't increment i again at the end of loop
          }
        }
      }
      // WHILE loops
      else if (line.startsWith('WHILE ')) {
        const doIndex = line.indexOf(' DO');
        const condition = doIndex > 0 
          ? originalLine.substring(6, originalLine.toUpperCase().indexOf(' DO'))
          : originalLine.substring(6);
        
        i++; // Move to next line for WHILE body
        const body = parseBlock(['END WHILE', 'ENDWHILE']);
        
        blockStatements.push({
          type: 'while',
          content: originalLine,
          condition: condition,
          body: body,
          lineNumber
        });
        
        // Skip END WHILE
        if (i < lines.length && 
            (lines[i].content.toUpperCase() === 'END WHILE' || 
             lines[i].content.toUpperCase() === 'ENDWHILE')) {
          i++; // Skip the END WHILE line
          continue; // Don't increment i again at the end of loop
        }
      }
      // FOR loops with enhanced parsing
      else if (line.startsWith('FOR ')) {
        // Enhanced regex to handle different FOR loop formats
        const forPattern = /FOR\s+(\w+)\s+(?:=|FROM)\s+(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+?))?$/i;
        const forMatch = originalLine.match(forPattern);
        
        if (forMatch) {
          const loopVariable = forMatch[1];
          const startValue = forMatch[2];
          const endValue = forMatch[3];
          const step = forMatch[4] || '1';
          
          variables.add(loopVariable);
          i++; // Move to next line for FOR body
          const body = parseBlock(['NEXT', 'END FOR', 'ENDFOR']);
          
          blockStatements.push({
            type: 'for',
            content: originalLine,
            loopVariable: loopVariable,
            startValue: startValue,
            endValue: endValue,
            step: step,
            body: body,
            lineNumber
          });
          
          // Skip NEXT/END FOR
          if (i < lines.length) {
            const endLine = lines[i].content.toUpperCase();
            if (endLine.startsWith('NEXT') || endLine === 'END FOR' || endLine === 'ENDFOR') {
              i++; // Skip the end line
              continue; // Don't increment i again at the end of loop
            }
          }
        }
      }
      
      i++;
    }
    
    return blockStatements;
  };

  try {
    statements.push(...parseBlock());
  } catch (error) {
    console.error('Parsing error:', error);
    // Return partial parsing results even if there's an error
  }
  
  return {
    statements,
    variables,
    hasInput,
    hasOutput
  };
};

// Enhanced code generators for each language
const generatePythonCode = (parsed: ParsedPseudocode): string => {
  let code = '# Generated Python code from pseudocode\n\n';
  
  const generateStatements = (statements: Statement[], indent = 0): string => {
    let result = '';
    const indentStr = '    '.repeat(indent);
    
    for (const stmt of statements) {
      switch (stmt.type) {
        case 'comment':
          result += `${indentStr}# ${stmt.content.replace(/^(\/\/|#|\/*|\*\/)/, '').trim()}\n`;
          break;
        case 'input':
          result += `${indentStr}${stmt.variable} = input("Enter ${stmt.variable}: ")\n`;
          break;
        case 'output':
          const message = stmt.message || '';
          // Handle both string literals and variables
          if (message.startsWith('"') || message.startsWith("'")) {
            result += `${indentStr}print(${message})\n`;
          } else if (message && !message.includes('"') && !message.includes("'")) {
            // Likely a variable or expression
            result += `${indentStr}print(${message})\n`;
          } else {
            result += `${indentStr}print("${message}")\n`;
          }
          break;
        case 'assignment':
          result += `${indentStr}${stmt.variable} = ${stmt.value}\n`;
          break;
        case 'if':
          result += `${indentStr}if ${stmt.condition}:\n`;
          const ifBody = generateStatements(stmt.body || [], indent + 1);
          result += ifBody || `${indentStr}    pass\n`;
          if (stmt.elseBody && stmt.elseBody.length > 0) {
            result += `${indentStr}else:\n`;
            const elseBody = generateStatements(stmt.elseBody, indent + 1);
            result += elseBody || `${indentStr}    pass\n`;
          }
          break;
        case 'while':
          result += `${indentStr}while ${stmt.condition}:\n`;
          const whileBody = generateStatements(stmt.body || [], indent + 1);
          result += whileBody || `${indentStr}    pass\n`;
          break;
        case 'for':
          result += `${indentStr}for ${stmt.loopVariable} in range(${stmt.startValue}, ${stmt.endValue} + 1, ${stmt.step}):\n`;
          const forBody = generateStatements(stmt.body || [], indent + 1);
          result += forBody || `${indentStr}    pass\n`;
          break;
      }
    }
    
    return result;
  };
  
  // Add main execution guard
  code += generateStatements(parsed.statements);
  
  // Add main function wrapper if we have input/output or complex logic
  if (parsed.hasInput || parsed.hasOutput || parsed.statements.length > 2) {
    code = '# Generated Python code from pseudocode\n\ndef main():\n' + 
           generateStatements(parsed.statements, 1) +
           '\nif __name__ == "__main__":\n    main()\n';
  }
  
  return code;
};

const generateJavaScriptCode = (parsed: ParsedPseudocode): string => {
  let code = '// Generated JavaScript code from pseudocode\n\n';
  
  if (parsed.hasInput) {
    code += 'const readline = require(\'readline\');\n';
    code += 'const rl = readline.createInterface({\n';
    code += '    input: process.stdin,\n';
    code += '    output: process.stdout\n';
    code += '});\n\n';
    code += 'function askQuestion(question) {\n';
    code += '    return new Promise(resolve => {\n';
    code += '        rl.question(question, resolve);\n';
    code += '    });\n';
    code += '}\n\n';
    code += 'async function main() {\n';
  } else {
    code += 'function main() {\n';
  }
  
  const generateStatements = (statements: Statement[], indent = 1): string => {
    let result = '';
    const indentStr = '    '.repeat(indent);
    
    for (const stmt of statements) {
      switch (stmt.type) {
        case 'comment':
          result += `${indentStr}// ${stmt.content.replace(/^(\/\/|#|\/*|\*\/)/, '').trim()}\n`;
          break;
        case 'input':
          if (parsed.hasInput) {
            result += `${indentStr}let ${stmt.variable} = await askQuestion("Enter ${stmt.variable}: ");\n`;
          } else {
            result += `${indentStr}let ${stmt.variable} = prompt("Enter ${stmt.variable}:");\n`;
          }
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
  code += '}\n\n';
  
  if (parsed.hasInput) {
    code += 'main().then(() => rl.close());\n';
  } else {
    code += 'main();\n';
  }
  
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
          result += `${indentStr}// ${stmt.content.replace(/^(\/\/|#|\/*|\*\/)/, '').trim()}\n`;
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
  
  if (parsed.hasInput) {
    code += '        scanner.close();\n';
  }
  
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
          result += `${indentStr}// ${stmt.content.replace(/^(\/\/|#|\/*|\*\/)/, '').trim()}\n`;
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
          result += `${indentStr}// ${stmt.content.replace(/^(\/\/|#|\/*|\*\/)/, '').trim()}\n`;
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
          result += `${indentStr}// ${stmt.content.replace(/^(\/\/|#|\/*|\*\/)/, '').trim()}\n`;
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
          result += `${indentStr}// ${stmt.content.replace(/^(\/\/|#|\/*|\*\/)/, '').trim()}\n`;
          break;
        case 'input':
          result += `${indentStr}println!("Enter ${stmt.variable}: ");\n`;
          result += `${indentStr}let mut ${stmt.variable}_input = String::new();\n`;
          result += `${indentStr}io::stdin().read_line(&mut ${stmt.variable}_input).expect("Failed to read line");\n`;
          result += `${indentStr}let ${stmt.variable} = ${stmt.variable}_input.trim();\n`;
          break;
        case 'output':
          const message = stmt.message || '';
          if (message.startsWith('"') && message.endsWith('"')) {
            result += `${indentStr}println!(${message});\n`;
          } else {
            result += `${indentStr}println!("{}", ${message});\n`;
          }
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

// Enhanced code conversion function with better error handling
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

// Enhanced flowchart generation function with better node connection logic
const generateFlowchart = async (pseudocode: string): Promise<{ code: string; executionTime: number }> => {
  const startTime = Date.now();
  
  try {
    const parsed = parsePseudocode(pseudocode);
    
    if (parsed.statements.length === 0) {
      throw new Error('No valid pseudocode statements found for flowchart generation');
    }
    
    let flowchart = 'graph TD\n';
    let nodeId = 1;
    
    const generateFlowchartNodes = (statements: Statement[], parentId?: number): { startId: number; endId: number } => {
      let currentId = parentId || nodeId++;
      let firstId = currentId;
      let lastId = currentId;
      
      // Create start node if this is the root level
      if (!parentId) {
        flowchart += `    A${currentId}([Start])\n`;
        firstId = currentId;
        lastId = currentId;
      }
      
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        const stmtNodeId = nodeId++;
        
        // Connect to previous node if not the first statement
        if (i > 0 || parentId) {
          flowchart += `    A${lastId} --> A${stmtNodeId}\n`;
        }
        
        switch (stmt.type) {
          case 'start':
            flowchart += `    A${stmtNodeId}([Start])\n`;
            break;
            
          case 'end':
            flowchart += `    A${stmtNodeId}([End])\n`;
            break;
            
          case 'input':
            flowchart += `    A${stmtNodeId}[/Input: ${stmt.variable}/]\n`;
            break;
            
          case 'output':
            const outputText = (stmt.message || 'Output').substring(0, 25);
            flowchart += `    A${stmtNodeId}[/Output: ${outputText}/]\n`;
            break;
            
          case 'assignment':
            flowchart += `    A${stmtNodeId}[${stmt.variable} = ${stmt.value}]\n`;
            break;
            
          case 'if':
            const conditionText = (stmt.condition || 'condition').substring(0, 20);
            flowchart += `    A${stmtNodeId}{${conditionText}?}\n`;
            
            // Generate IF body
            const ifBodyResult = generateFlowchartNodes(stmt.body || [], stmtNodeId);
            flowchart += `    A${stmtNodeId} -->|Yes| A${ifBodyResult.startId}\n`;
            
            // Generate ELSE body if exists
            let elseEndId = stmtNodeId;
            if (stmt.elseBody && stmt.elseBody.length > 0) {
              const elseBodyResult = generateFlowchartNodes(stmt.elseBody, stmtNodeId);
              flowchart += `    A${stmtNodeId} -->|No| A${elseBodyResult.startId}\n`;
              elseEndId = elseBodyResult.endId;
            } else {
              // Create empty else path
              const emptyElseId = nodeId++;
              flowchart += `    A${stmtNodeId} -->|No| A${emptyElseId}\n`;
              flowchart += `    A${emptyElseId}[ ]\n`;
              elseEndId = emptyElseId;
            }
            
            // Create merge point after if/else
            const mergeId = nodeId++;
            flowchart += `    A${ifBodyResult.endId} --> A${mergeId}\n`;
            flowchart += `    A${elseEndId} --> A${mergeId}\n`;
            flowchart += `    A${mergeId}[ ]\n`;
            
            lastId = mergeId;
            continue; // Skip normal lastId update
            
          case 'while':
            const whileCondition = (stmt.condition || 'condition').substring(0, 20);
            flowchart += `    A${stmtNodeId}{While ${whileCondition}?}\n`;
            
            // Generate loop body
            const whileBodyResult = generateFlowchartNodes(stmt.body || [], stmtNodeId);
            flowchart += `    A${stmtNodeId} -->|Yes| A${whileBodyResult.startId}\n`;
            
            // Create loop back connection
            flowchart += `    A${whileBodyResult.endId} --> A${stmtNodeId}\n`;
            
            // Create exit path
            const whileExitId = nodeId++;
            flowchart += `    A${stmtNodeId} -->|No| A${whileExitId}\n`;
            flowchart += `    A${whileExitId}[ ]\n`;
            
            lastId = whileExitId;
            continue; // Skip normal lastId update
            
          case 'for':
            const forText = `${stmt.loopVariable} = ${stmt.startValue} to ${stmt.endValue}`;
            flowchart += `    A${stmtNodeId}{For ${forText}}\n`;
            
            // Generate loop body
            const forBodyResult = generateFlowchartNodes(stmt.body || [], stmtNodeId);
            flowchart += `    A${stmtNodeId} --> A${forBodyResult.startId}\n`;
            
            // Create loop back connection
            flowchart += `    A${forBodyResult.endId} --> A${stmtNodeId}\n`;
            
            // Create exit path
            const forExitId = nodeId++;
            flowchart += `    A${stmtNodeId} --> A${forExitId}\n`;
            flowchart += `    A${forExitId}[ ]\n`;
            
            lastId = forExitId;
            continue; // Skip normal lastId update
            
          case 'comment':
            // Skip comments in flowchart
            continue;
            
          default:
            flowchart += `    A${stmtNodeId}[${stmt.content}]\n`;
        }
        
        lastId = stmtNodeId;
      }
      
      // Add explicit end node if this is the root level and no explicit end was found
      if (!parentId && !statements.some(s => s.type === 'end')) {
        const endId = nodeId++;
        flowchart += `    A${endId}([End])\n`;
        flowchart += `    A${lastId} --> A${endId}\n`;
        lastId = endId;
      }
      
      return { startId: firstId, endId: lastId };
    };
    
    generateFlowchartNodes(parsed.statements);
    
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
            'Ensure proper indentation for nested blocks',
            'Use SET for assignments (e.g., SET x = 10)',
            'End IF statements with END IF',
            'End WHILE loops with END WHILE or use DO keyword'
          ];
          avoidSuggestions = [
            'Do not use programming language-specific syntax',
            'Avoid mixing different pseudocode styles',
            'Do not leave incomplete statements',
            'Avoid complex nested structures without proper keywords'
          ];
          severity = 'high';
          visualIndicators = 'pseudocode_input';
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
          visualIndicators = 'language_selector';
        } else {
          userFriendlyMessage = `Conversion to ${language} failed due to a parsing error`;
          fixSuggestions = [
            'Check your pseudocode for syntax errors',
            'Ensure all IF statements have matching END IF',
            'Verify that loops have proper start and end markers',
            'Try breaking complex logic into simpler steps',
            'Use parentheses for complex conditions'
          ];
          avoidSuggestions = [
            'Do not use ambiguous variable names',
            'Avoid deeply nested control structures',
            'Do not mix pseudocode with actual code syntax',
            'Avoid incomplete conditional statements'
          ];
          visualIndicators = 'pseudocode_input';
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
            'Use descriptive names for variables and conditions',
            'Keep the logic flow simple and linear'
          ];
          avoidSuggestions = [
            'Avoid overly complex nested logic for flowcharts',
            'Do not use programming-specific constructs',
            'Avoid unclear or ambiguous step descriptions',
            'Do not mix different pseudocode styles'
          ];
        } else {
          userFriendlyMessage = 'Flowchart generation encountered an unexpected error';
          fixSuggestions = [
            'Simplify the pseudocode structure',
            'Break down complex operations into smaller steps',
            'Use standard pseudocode conventions',
            'Ensure proper nesting of control structures'
          ];
          avoidSuggestions = [
            'Avoid overly complex branching logic',
            'Do not use unconventional pseudocode syntax',
            'Avoid recursive or self-referential logic'
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