import { db } from '../db';
import { conversionRequestsTable, conversionResultsTable, errorLogsTable } from '../db/schema';
import { type CreateConversionRequestInput, type ConversionResponse, type ConversionResult, supportedLanguages } from '../schema';

// Enhanced pseudocode parsing and code generation logic
interface ParsedPseudocode {
  statements: Statement[];
  variables: Set<string>;
  hasInput: boolean;
  hasOutput: boolean;
  syntaxErrors: SyntaxError[];
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

interface SyntaxError {
  line: number;
  message: string;
  type: 'missing_keyword' | 'incomplete_statement' | 'invalid_syntax' | 'ambiguous_structure';
  suggestion: string;
}

// Comprehensive pseudocode parser with enhanced error detection
const parsePseudocode = (pseudocode: string): ParsedPseudocode => {
  const lines = pseudocode.split('\n').map((line, index) => ({ 
    content: line.trim(), 
    number: index + 1 
  })).filter(line => line.content.length > 0);
  
  const statements: Statement[] = [];
  const variables = new Set<string>();
  const syntaxErrors: SyntaxError[] = [];
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
      // Input statements - enhanced parsing
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
        } else {
          syntaxErrors.push({
            line: lineNumber,
            message: 'Input statement is missing variable name',
            type: 'incomplete_statement',
            suggestion: 'Use format: INPUT variableName'
          });
        }
      }
      // Output statements - enhanced parsing
      else if (line.startsWith('OUTPUT ') || line.startsWith('PRINT ') || line.startsWith('DISPLAY ') || line.startsWith('WRITE ')) {
        hasOutput = true;
        const spaceIndex = originalLine.indexOf(' ');
        const message = spaceIndex >= 0 ? originalLine.substring(spaceIndex + 1) : '';
        
        if (!message.trim()) {
          syntaxErrors.push({
            line: lineNumber,
            message: 'Output statement is missing content',
            type: 'incomplete_statement',
            suggestion: 'Use format: PRINT "message" or PRINT variableName'
          });
        }
        
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
          
          if (!cleanVariable || !value) {
            syntaxErrors.push({
              line: lineNumber,
              message: 'Assignment statement is incomplete',
              type: 'incomplete_statement',
              suggestion: 'Use format: SET variable = value or variable := value'
            });
          } else {
            variables.add(cleanVariable);
            blockStatements.push({ 
              type: 'assignment', 
              content: originalLine, 
              variable: cleanVariable, 
              value: value,
              lineNumber 
            });
          }
        } else {
          syntaxErrors.push({
            line: lineNumber,
            message: 'Invalid assignment syntax',
            type: 'invalid_syntax',
            suggestion: 'Use a single assignment operator (=, <-, or :=)'
          });
        }
      }
      // IF statements with comprehensive error checking
      else if (line.startsWith('IF ')) {
        const thenIndex = line.indexOf(' THEN');
        if (thenIndex > 0) {
          const condition = originalLine.substring(3, originalLine.toUpperCase().indexOf(' THEN'));
          
          if (!condition.trim()) {
            syntaxErrors.push({
              line: lineNumber,
              message: 'IF statement is missing condition',
              type: 'incomplete_statement',
              suggestion: 'Use format: IF condition THEN'
            });
          }
          
          i++; // Move to next line for IF body
          
          const ifBody = parseBlock(['ELSE IF', 'ELSEIF', 'ELSE', 'END IF', 'ENDIF']);
          let elseBody: Statement[] = [];
          
          // Handle ELSE IF and ELSE
          if (i < lines.length) {
            const currentLine = lines[i].content.toUpperCase();
            if (currentLine.startsWith('ELSE IF') || currentLine.startsWith('ELSEIF')) {
              i++; 
              elseBody = parseBlock(['END IF', 'ENDIF']);
            } else if (currentLine.startsWith('ELSE')) {
              i++; 
              elseBody = parseBlock(['END IF', 'ENDIF']);
            }
          }
          
          // Check for missing END IF
          if (i >= lines.length || 
              (!lines[i].content.toUpperCase().includes('END IF') && 
               !lines[i].content.toUpperCase().includes('ENDIF'))) {
            syntaxErrors.push({
              line: lineNumber,
              message: 'IF statement is missing END IF',
              type: 'missing_keyword',
              suggestion: 'Add END IF or ENDIF to close the IF statement'
            });
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
            i++; 
            continue; 
          }
        } else {
          syntaxErrors.push({
            line: lineNumber,
            message: 'IF statement is missing THEN keyword',
            type: 'missing_keyword',
            suggestion: 'Use format: IF condition THEN'
          });
        }
      }
      // WHILE loops with enhanced error checking
      else if (line.startsWith('WHILE ')) {
        const doIndex = line.indexOf(' DO');
        const condition = doIndex > 0 
          ? originalLine.substring(6, originalLine.toUpperCase().indexOf(' DO'))
          : originalLine.substring(6);
        
        if (!condition.trim()) {
          syntaxErrors.push({
            line: lineNumber,
            message: 'WHILE loop is missing condition',
            type: 'incomplete_statement',
            suggestion: 'Use format: WHILE condition DO or WHILE condition'
          });
        }
        
        i++; 
        const body = parseBlock(['END WHILE', 'ENDWHILE']);
        
        // Check for missing END WHILE
        if (i >= lines.length || 
            (!lines[i].content.toUpperCase().includes('END WHILE') && 
             !lines[i].content.toUpperCase().includes('ENDWHILE'))) {
          syntaxErrors.push({
            line: lineNumber,
            message: 'WHILE loop is missing END WHILE',
            type: 'missing_keyword',
            suggestion: 'Add END WHILE or ENDWHILE to close the loop'
          });
        }
        
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
          i++; 
          continue; 
        }
      }
      // FOR loops with comprehensive parsing
      else if (line.startsWith('FOR ')) {
        const forPattern = /FOR\s+(\w+)\s+(?:=|FROM)\s+(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+?))?$/i;
        const forMatch = originalLine.match(forPattern);
        
        if (forMatch) {
          const loopVariable = forMatch[1];
          const startValue = forMatch[2];
          const endValue = forMatch[3];
          const step = forMatch[4] || '1';
          
          variables.add(loopVariable);
          i++; 
          const body = parseBlock(['NEXT', 'END FOR', 'ENDFOR']);
          
          // Check for missing loop end
          if (i >= lines.length) {
            syntaxErrors.push({
              line: lineNumber,
              message: 'FOR loop is missing NEXT or END FOR',
              type: 'missing_keyword',
              suggestion: 'Add NEXT, END FOR, or ENDFOR to close the loop'
            });
          }
          
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
              i++; 
              continue; 
            }
          }
        } else {
          syntaxErrors.push({
            line: lineNumber,
            message: 'FOR loop has invalid syntax',
            type: 'invalid_syntax',
            suggestion: 'Use format: FOR variable FROM start TO end STEP increment'
          });
        }
      }
      // Unrecognized statement
      else if (originalLine.trim() && 
               !line.startsWith('ELSE') && 
               !line.startsWith('END') && 
               !line.startsWith('NEXT')) {
        syntaxErrors.push({
          line: lineNumber,
          message: `Unrecognized statement: ${originalLine}`,
          type: 'invalid_syntax',
          suggestion: 'Check for typos or use standard pseudocode keywords'
        });
      }
      
      i++;
    }
    
    return blockStatements;
  };

  try {
    statements.push(...parseBlock());
  } catch (error) {
    console.error('Parsing error:', error);
    syntaxErrors.push({
      line: 0,
      message: 'Unexpected parsing error occurred',
      type: 'invalid_syntax',
      suggestion: 'Simplify the pseudocode structure and try again'
    });
  }
  
  return {
    statements,
    variables,
    hasInput,
    hasOutput,
    syntaxErrors
  };
};

// Enhanced Python code generator with better error handling
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
          if (message.startsWith('"') || message.startsWith("'")) {
            result += `${indentStr}print(${message})\n`;
          } else if (message && !message.includes('"') && !message.includes("'")) {
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
  
  code += generateStatements(parsed.statements);
  
  // Add main function wrapper for better structure
  if (parsed.hasInput || parsed.hasOutput || parsed.statements.length > 2) {
    code = '# Generated Python code from pseudocode\n\ndef main():\n' + 
           generateStatements(parsed.statements, 1) +
           '\nif __name__ == "__main__":\n    main()\n';
  }
  
  return code;
};

// Generate fallback Python code for critical failures
const generatePythonFallback = (pseudocode: string, errors: SyntaxError[]): string => {
  let code = '# Simplified Python fallback - Issues detected in pseudocode\n\n';
  code += '"""\nPseudocode conversion issues:\n';
  
  errors.forEach((error, index) => {
    code += `  ${index + 1}. Line ${error.line}: ${error.message}\n`;
    code += `     Suggestion: ${error.suggestion}\n`;
  });
  
  code += '\nOriginal pseudocode:\n';
  pseudocode.split('\n').forEach((line, index) => {
    code += `  ${index + 1}: ${line}\n`;
  });
  
  code += '"""\n\n';
  code += 'def main():\n';
  code += '    print("This is a simplified Python program.")\n';
  code += '    print("Please review the pseudocode issues above.")\n';
  code += '    \n';
  code += '    # TODO: Fix the pseudocode issues and regenerate\n';
  code += '    # Common fixes:\n';
  
  const uniqueTypes = [...new Set(errors.map(e => e.type))];
  uniqueTypes.forEach(type => {
    switch (type) {
      case 'missing_keyword':
        code += '    # - Add missing keywords like THEN, END IF, END WHILE\n';
        break;
      case 'incomplete_statement':
        code += '    # - Complete all statements with required parts\n';
        break;
      case 'invalid_syntax':
        code += '    # - Check for typos and use standard pseudocode syntax\n';
        break;
      case 'ambiguous_structure':
        code += '    # - Clarify ambiguous control flow structures\n';
        break;
    }
  });
  
  code += '    \n';
  code += '    pass  # Replace with your corrected logic\n';
  code += '\nif __name__ == "__main__":\n';
  code += '    main()\n';
  
  return code;
};

// Enhanced language-specific code generators
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

// Generate reformatted pseudocode for 'pseudocode' target language
const generateReformattedPseudocode = (parsed: ParsedPseudocode): string => {
  let code = '// Reformatted and clarified pseudocode\n\n';
  
  if (parsed.syntaxErrors.length > 0) {
    code += '// DETECTED AMBIGUITIES AND ISSUES:\n';
    parsed.syntaxErrors.forEach((error, index) => {
      code += `// ${index + 1}. Line ${error.line}: ${error.message}\n`;
      code += `//    Suggestion: ${error.suggestion}\n`;
    });
    code += '\n';
  }
  
  const generateStatements = (statements: Statement[], indent = 0): string => {
    let result = '';
    const indentStr = '    '.repeat(indent);
    
    for (const stmt of statements) {
      switch (stmt.type) {
        case 'start':
          result += `${indentStr}START\n`;
          break;
        case 'end':
          result += `${indentStr}END\n`;
          break;
        case 'comment':
          result += `${indentStr}// ${stmt.content.replace(/^(\/\/|#|\/*|\*\/)/, '').trim()}\n`;
          break;
        case 'input':
          result += `${indentStr}INPUT ${stmt.variable}\n`;
          break;
        case 'output':
          result += `${indentStr}OUTPUT ${stmt.message}\n`;
          break;
        case 'assignment':
          result += `${indentStr}SET ${stmt.variable} = ${stmt.value}\n`;
          break;
        case 'if':
          result += `${indentStr}IF ${stmt.condition} THEN\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          if (stmt.elseBody && stmt.elseBody.length > 0) {
            result += `${indentStr}ELSE\n`;
            result += generateStatements(stmt.elseBody, indent + 1);
          }
          result += `${indentStr}END IF\n`;
          break;
        case 'while':
          result += `${indentStr}WHILE ${stmt.condition} DO\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}END WHILE\n`;
          break;
        case 'for':
          result += `${indentStr}FOR ${stmt.loopVariable} FROM ${stmt.startValue} TO ${stmt.endValue} STEP ${stmt.step}\n`;
          result += generateStatements(stmt.body || [], indent + 1);
          result += `${indentStr}END FOR\n`;
          break;
      }
    }
    
    return result;
  };
  
  if (!parsed.statements.some(s => s.type === 'start')) {
    code += 'START\n';
  }
  
  code += generateStatements(parsed.statements);
  
  if (!parsed.statements.some(s => s.type === 'end')) {
    code += 'END\n';
  }
  
  if (parsed.syntaxErrors.length > 0) {
    code += '\n// RECOMMENDATIONS:\n';
    code += '// 1. Review the issues mentioned above\n';
    code += '// 2. Use consistent pseudocode syntax\n';
    code += '// 3. Ensure all control structures are properly closed\n';
    code += '// 4. Test with simpler pseudocode first if needed\n';
  }
  
  return code;
};

// Enhanced code conversion function with comprehensive error handling
const convertToLanguage = async (pseudocode: string, language: string): Promise<{ code: string; executionTime: number }> => {
  const startTime = Date.now();
  
  try {
    // Parse the pseudocode with enhanced error detection
    const parsed = parsePseudocode(pseudocode);
    
    if (parsed.statements.length === 0 && parsed.syntaxErrors.length === 0) {
      throw new Error('No valid pseudocode statements found');
    }
    
    let code = '';
    switch (language) {
      case 'pseudocode':
        code = generateReformattedPseudocode(parsed);
        break;
      case 'python':
        if (parsed.syntaxErrors.length > 0) {
          // Generate fallback with error explanations for critical issues
          code = generatePythonFallback(pseudocode, parsed.syntaxErrors);
        } else {
          code = generatePythonCode(parsed);
        }
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

// Enhanced flowchart generation with detailed Mermaid syntax
const generateFlowchart = async (pseudocode: string): Promise<{ code: string; executionTime: number; mockDownloadUrl: string }> => {
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
        flowchart += `    A${currentId}([🚀 Start])\n`;
        firstId = currentId;
        lastId = currentId;
      }
      
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        const stmtNodeId = nodeId++;
        
        // Connect to previous node
        if (i > 0 || parentId) {
          flowchart += `    A${lastId} --> A${stmtNodeId}\n`;
        } else if (firstId !== stmtNodeId) {
          flowchart += `    A${firstId} --> A${stmtNodeId}\n`;
        }
        
        switch (stmt.type) {
          case 'start':
            flowchart += `    A${stmtNodeId}([🚀 Start])\n`;
            break;
            
          case 'end':
            flowchart += `    A${stmtNodeId}([🏁 End])\n`;
            break;
            
          case 'input':
            flowchart += `    A${stmtNodeId}[/📥 Input: ${stmt.variable}/]\n`;
            break;
            
          case 'output':
            const outputText = (stmt.message || 'Output').substring(0, 25);
            flowchart += `    A${stmtNodeId}[/📤 Output: ${outputText}/]\n`;
            break;
            
          case 'assignment':
            const assignText = `${stmt.variable} = ${(stmt.value || '').substring(0, 15)}`;
            flowchart += `    A${stmtNodeId}[📝 ${assignText}]\n`;
            break;
            
          case 'if':
            const conditionText = (stmt.condition || 'condition').substring(0, 20);
            flowchart += `    A${stmtNodeId}{🤔 ${conditionText}?}\n`;
            
            // Generate IF body
            if (stmt.body && stmt.body.length > 0) {
              const ifBodyResult = generateFlowchartNodes(stmt.body, stmtNodeId);
              flowchart += `    A${stmtNodeId} -->|✅ Yes| A${ifBodyResult.startId}\n`;
              
              // Create merge point after IF body
              const ifMergeId = nodeId++;
              flowchart += `    A${ifBodyResult.endId} --> A${ifMergeId}[⚡ Continue]\n`;
              
              // Generate ELSE body if exists
              if (stmt.elseBody && stmt.elseBody.length > 0) {
                const elseBodyResult = generateFlowchartNodes(stmt.elseBody, stmtNodeId);
                flowchart += `    A${stmtNodeId} -->|❌ No| A${elseBodyResult.startId}\n`;
                flowchart += `    A${elseBodyResult.endId} --> A${ifMergeId}\n`;
              } else {
                // Direct no path to merge
                flowchart += `    A${stmtNodeId} -->|❌ No| A${ifMergeId}\n`;
              }
              
              lastId = ifMergeId;
            } else {
              // Empty IF body
              const emptyId = nodeId++;
              flowchart += `    A${stmtNodeId} -->|✅ Yes| A${emptyId}[⚡ Continue]\n`;
              flowchart += `    A${stmtNodeId} -->|❌ No| A${emptyId}\n`;
              lastId = emptyId;
            }
            continue; // Skip normal lastId update
            
          case 'while':
            const whileCondition = (stmt.condition || 'condition').substring(0, 20);
            flowchart += `    A${stmtNodeId}{🔄 While ${whileCondition}?}\n`;
            
            // Generate loop body
            if (stmt.body && stmt.body.length > 0) {
              const whileBodyResult = generateFlowchartNodes(stmt.body, stmtNodeId);
              flowchart += `    A${stmtNodeId} -->|✅ Yes| A${whileBodyResult.startId}\n`;
              
              // Create loop back connection
              flowchart += `    A${whileBodyResult.endId} -->|🔁 Loop Back| A${stmtNodeId}\n`;
            }
            
            // Create exit path
            const whileExitId = nodeId++;
            flowchart += `    A${stmtNodeId} -->|❌ Exit Loop| A${whileExitId}[⚡ Continue]\n`;
            
            lastId = whileExitId;
            continue; // Skip normal lastId update
            
          case 'for':
            const forText = `${stmt.loopVariable}: ${stmt.startValue} to ${stmt.endValue}`;
            flowchart += `    A${stmtNodeId}{🔢 For ${forText}}\n`;
            
            // Generate loop body
            if (stmt.body && stmt.body.length > 0) {
              const forBodyResult = generateFlowchartNodes(stmt.body, stmtNodeId);
              flowchart += `    A${stmtNodeId} -->|🔁 Iterate| A${forBodyResult.startId}\n`;
              
              // Create loop back connection
              flowchart += `    A${forBodyResult.endId} -->|⏭️ Next| A${stmtNodeId}\n`;
            }
            
            // Create exit path
            const forExitId = nodeId++;
            flowchart += `    A${stmtNodeId} -->|🏁 Done| A${forExitId}[⚡ Continue]\n`;
            
            lastId = forExitId;
            continue; // Skip normal lastId update
            
          case 'comment':
            // Include comments as notes
            const commentText = stmt.content.replace(/^(\/\/|#|\/*|\*\/)/, '').trim().substring(0, 30);
            flowchart += `    A${stmtNodeId}[💭 Note: ${commentText}]\n`;
            flowchart += `    A${stmtNodeId} -.-> A${stmtNodeId}\n`; // Self-referencing dotted line for notes
            break;
            
          default:
            const defaultText = stmt.content.substring(0, 25);
            flowchart += `    A${stmtNodeId}[⚙️ ${defaultText}]\n`;
        }
        
        lastId = stmtNodeId;
      }
      
      // Add explicit end node if this is the root level
      if (!parentId && !statements.some(s => s.type === 'end')) {
        const endId = nodeId++;
        flowchart += `    A${endId}([🏁 End])\n`;
        if (lastId !== endId) {
          flowchart += `    A${lastId} --> A${endId}\n`;
        }
        lastId = endId;
      }
      
      return { startId: firstId, endId: lastId };
    };
    
    generateFlowchartNodes(parsed.statements);
    
    // Add styling for better visual distinction
    flowchart += '\n    %% Styling for better readability\n';
    flowchart += '    classDef startEnd fill:#e1f5fe,stroke:#01579b,stroke-width:3px\n';
    flowchart += '    classDef process fill:#f3e5f5,stroke:#4a148c,stroke-width:2px\n';
    flowchart += '    classDef decision fill:#fff3e0,stroke:#e65100,stroke-width:2px\n';
    flowchart += '    classDef inputOutput fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px\n';
    
    const executionTime = Math.max(1, Date.now() - startTime);
    
    // Generate mock download URL for JPG/PNG simulation
    const mockDownloadUrl = `https://flowchart-generator.api/download/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
    
    return { code: flowchart, executionTime, mockDownloadUrl };
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

    // Parse pseudocode once for error detection
    const parsed = parsePseudocode(input.pseudocode);
    
    // Log syntax errors if found
    if (parsed.syntaxErrors.length > 0) {
      for (const syntaxError of parsed.syntaxErrors) {
        const errorData = await db.insert(errorLogsTable)
          .values({
            request_id: request.id,
            error_type: 'pseudocode_syntax_error',
            error_message: syntaxError.message,
            user_friendly_message: `Pseudocode issue on line ${syntaxError.line}: ${syntaxError.message}`,
            fix_suggestions: JSON.stringify([
              syntaxError.suggestion,
              'Check pseudocode syntax reference',
              'Use standard keywords like IF, THEN, ELSE, END IF',
              'Ensure all control structures are properly closed'
            ]),
            avoid_suggestions: JSON.stringify([
              'Do not mix different pseudocode styles',
              'Avoid leaving statements incomplete',
              'Do not use programming language syntax instead of pseudocode',
              'Avoid deeply nested structures without proper keywords'
            ]),
            visual_indicators: 'pseudocode_input',
            audio_feedback: 'syntax-error',
            severity: syntaxError.type === 'invalid_syntax' ? 'high' : 'medium'
          })
          .returning()
          .execute();

        errors.push(errorData[0]);
      }
    }

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
        let visualIndicators = 'pseudocode_input';
        let audioFeedback = 'conversion-failed';
        let severity: 'low' | 'medium' | 'high' | 'critical' = 'high';

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
          severity = 'critical';
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
        }
        
        // For critical Python failures, provide the fallback code in error log
        if (language === 'python' && severity === 'critical' && parsed.syntaxErrors.length > 0) {
          const fallbackCode = generatePythonFallback(input.pseudocode, parsed.syntaxErrors);
          fixSuggestions.unshift('A runnable Python fallback has been generated with explanations');
          
          // Store fallback code as part of the error
          userFriendlyMessage += '. A simplified Python fallback with error explanations has been generated.';
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

        // Create failed result record with fallback for Python
        let failedCode = '';
        if (language === 'python' && severity === 'critical' && parsed.syntaxErrors.length > 0) {
          failedCode = generatePythonFallback(input.pseudocode, parsed.syntaxErrors);
        }

        const failedResult = await db.insert(conversionResultsTable)
          .values({
            request_id: request.id,
            language: language,
            output_type: 'code',
            generated_code: failedCode,
            execution_time_ms: 0,
            success: failedCode.length > 0, // Success if fallback was generated
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
        const { code, executionTime, mockDownloadUrl } = await generateFlowchart(input.pseudocode);
        
        // Store the mock download URL in the generated code as a comment for frontend access
        const codeWithMockUrl = `${code}\n%% Mock download URL: ${mockDownloadUrl}`;
        
        const flowchartResult = await db.insert(conversionResultsTable)
          .values({
            request_id: request.id,
            language: 'mermaid',
            output_type: 'flowchart',
            generated_code: codeWithMockUrl,
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

        // Create failed flowchart result
        const failedFlowchartResult = await db.insert(conversionResultsTable)
          .values({
            request_id: request.id,
            language: 'mermaid',
            output_type: 'flowchart',
            generated_code: '',
            execution_time_ms: 0,
            success: false,
            error_message: errorMessage
          })
          .returning()
          .execute();

        results.push(failedFlowchartResult[0] as ConversionResult);
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