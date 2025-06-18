
import { describe, expect, it } from 'bun:test';
import { type VoiceCommandInput } from '../schema';
import { processVoiceCommand } from '../handlers/process_voice_command';

describe('processVoiceCommand', () => {
  it('should process convert command', async () => {
    const input: VoiceCommandInput = {
      command: 'convert',
      parameters: {
        pseudocode: 'print hello world',
        target_languages: ['python', 'javascript'],
        include_flowchart: true
      },
      user_id: 'test-user'
    };

    const result = await processVoiceCommand(input);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Convert command processed');
    expect(result.data).toEqual({
      action: 'initiate_conversion',
      pseudocode: 'print hello world',
      target_languages: ['python', 'javascript'],
      include_flowchart: true
    });
  });

  it('should process convert command with default parameters', async () => {
    const input: VoiceCommandInput = {
      command: 'convert'
    };

    const result = await processVoiceCommand(input);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Convert command processed');
    expect(result.data).toEqual({
      action: 'initiate_conversion',
      pseudocode: '',
      target_languages: ['python'],
      include_flowchart: false
    });
  });

  it('should process clear command', async () => {
    const input: VoiceCommandInput = {
      command: 'clear',
      parameters: {
        fields: ['pseudocode', 'results', 'errors']
      }
    };

    const result = await processVoiceCommand(input);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Clear command processed');
    expect(result.data).toEqual({
      action: 'clear_input',
      fields: ['pseudocode', 'results', 'errors']
    });
  });

  it('should process clear command with default fields', async () => {
    const input: VoiceCommandInput = {
      command: 'clear'
    };

    const result = await processVoiceCommand(input);

    expect(result.success).toBe(true);
    expect(result.data?.fields).toEqual(['pseudocode', 'results']);
  });

  it('should process copy command', async () => {
    const input: VoiceCommandInput = {
      command: 'copy',
      parameters: {
        content_type: 'flowchart',
        language: 'python'
      }
    };

    const result = await processVoiceCommand(input);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Copy command processed');
    expect(result.data).toEqual({
      action: 'copy_to_clipboard',
      content_type: 'flowchart',
      language: 'python'
    });
  });

  it('should process copy command with defaults', async () => {
    const input: VoiceCommandInput = {
      command: 'copy'
    };

    const result = await processVoiceCommand(input);

    expect(result.success).toBe(true);
    expect(result.data?.content_type).toBe('generated_code');
    expect(result.data?.language).toBe(null);
  });

  it('should process accessibility_toggle command', async () => {
    const input: VoiceCommandInput = {
      command: 'accessibility_toggle',
      parameters: {
        accessibility_mode: 'large_text'
      },
      user_id: 'test-user'
    };

    const result = await processVoiceCommand(input);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Accessibility mode toggled to large_text');
    expect(result.data).toEqual({
      action: 'toggle_accessibility',
      mode: 'large_text',
      user_id: 'test-user'
    });
  });

  it('should process accessibility_toggle with default mode', async () => {
    const input: VoiceCommandInput = {
      command: 'accessibility_toggle'
    };

    const result = await processVoiceCommand(input);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Accessibility mode toggled to high_contrast');
    expect(result.data?.mode).toBe('high_contrast');
  });

  it('should process language_select command', async () => {
    const input: VoiceCommandInput = {
      command: 'language_select',
      parameters: {
        language: 'java'
      },
      user_id: 'test-user'
    };

    const result = await processVoiceCommand(input);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Language selected: java');
    expect(result.data).toEqual({
      action: 'select_language',
      language: 'java',
      user_id: 'test-user'
    });
  });

  it('should process language_select with default language', async () => {
    const input: VoiceCommandInput = {
      command: 'language_select'
    };

    const result = await processVoiceCommand(input);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Language selected: python');
    expect(result.data?.language).toBe('python');
  });

  it('should handle unknown command', async () => {
    const input = {
      command: 'unknown_command' as any
    };

    const result = await processVoiceCommand(input);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Unknown voice command: unknown_command');
    expect(result.data).toBeUndefined();
  });

  it('should handle missing parameters gracefully', async () => {
    const input: VoiceCommandInput = {
      command: 'convert'
    };

    const result = await processVoiceCommand(input);

    expect(result.success).toBe(true);
    expect(result.data?.pseudocode).toBe('');
    expect(result.data?.target_languages).toEqual(['python']);
    expect(result.data?.include_flowchart).toBe(false);
  });
});
