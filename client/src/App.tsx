
import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/utils/trpc';
import type { 
  CreateConversionRequestInput, 
  ConversionResponse, 
  UpdateUserSettingsInput,
  ConversionResult,
  ErrorLog,
  supportedLanguages
} from '../../server/src/schema';

// Speech Recognition type declarations
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onend: () => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
  length: number;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

declare const SpeechRecognition: {
  prototype: SpeechRecognition;
  new(): SpeechRecognition;
};

// Voice recognition hook
const useVoiceRecognition = (onResult: (text: string) => void, enabled: boolean) => {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognitionClass();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';
      
      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        onResult(transcript);
        setIsListening(false);
      };
      
      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
      
      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };
      
      setIsSupported(true);
    }
  }, [onResult]);

  const startListening = useCallback(() => {
    if (recognitionRef.current && enabled && !isListening) {
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [enabled, isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  return { startListening, stopListening, isListening, isSupported };
};

function App() {
  // State management
  const [pseudocode, setPseudocode] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['python']);
  const [includeFlowchart, setIncludeFlowchart] = useState(false);
  const [userId] = useState('demo-user');
  const [isLoading, setIsLoading] = useState(false);
  const [conversionResult, setConversionResult] = useState<ConversionResponse | null>(null);
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [progress, setProgress] = useState(0);

  // Accessibility state
  const [accessibilityMode, setAccessibilityMode] = useState<'standard' | 'high_contrast' | 'large_text' | 'simplified'>('standard');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [highContrast, setHighContrast] = useState(false);
  const [audioFeedback, setAudioFeedback] = useState(false);

  // Load user settings
  const loadUserSettings = useCallback(async () => {
    try {
      const settings = await trpc.getUserSettings.query(userId);
      setAccessibilityMode(settings.accessibility_mode);
      setVoiceEnabled(settings.voice_enabled);
      setFontSize(settings.font_size);
      setHighContrast(settings.high_contrast);
      setAudioFeedback(settings.audio_feedback);
      setSelectedLanguages(settings.preferred_languages);
    } catch (error) {
      console.error('Failed to load user settings:', error);
    }
  }, [userId]);

  useEffect(() => {
    loadUserSettings();
  }, [loadUserSettings]);

  // Audio feedback
  const playAudioFeedback = useCallback((type: 'success' | 'error' | 'info') => {
    if (audioFeedback && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance();
      utterance.rate = 0.8;
      utterance.pitch = 1.0;
      
      switch (type) {
        case 'success':
          utterance.text = 'Conversion completed successfully';
          break;
        case 'error':
          utterance.text = 'Error occurred during conversion';
          break;
        case 'info':
          utterance.text = 'Processing your request';
          break;
      }
      
      speechSynthesis.speak(utterance);
    }
  }, [audioFeedback]);

  // Get visual indicator classes based on error indicators
  const getVisualIndicatorClasses = useCallback((elementType: string) => {
    const relevantErrors = errors.filter(error => 
      error.visual_indicators?.includes(elementType)
    );
    
    if (relevantErrors.length === 0) return '';
    
    const highestSeverity = relevantErrors.reduce((max, error) => {
      const severityLevels = { low: 1, medium: 2, high: 3, critical: 4 };
      return severityLevels[error.severity] > severityLevels[max.severity] ? error : max;
    });
    
    switch (highestSeverity.severity) {
      case 'critical':
        return 'critical-border neuro-error';
      case 'high':
        return 'error-border neuro-error animate-pulse';
      case 'medium':
        return 'border-red-500 border-2 ring-2 ring-red-300 ring-opacity-50';
      case 'low':
        return 'warning-border ring-2 ring-yellow-300 ring-opacity-50';
      default:
        return '';
    }
  }, [errors]);

  // Enhanced audio feedback with more descriptive messages
  const playEnhancedAudioFeedback = useCallback((errorLog?: ErrorLog) => {
    if (!audioFeedback || !('speechSynthesis' in window)) return;
    
    const utterance = new SpeechSynthesisUtterance();
    utterance.rate = 0.7;
    utterance.pitch = 1.0;
    utterance.volume = 0.8;
    
    if (errorLog) {
      // Enhanced error-specific audio feedback
      let message = `Error with ${errorLog.severity} severity: ${errorLog.user_friendly_message}`;
      
      if (errorLog.fix_suggestions.length > 0) {
        message += `. Here's what to do: ${errorLog.fix_suggestions[0]}`;
      }
      
      // Add additional context based on error type
      if (errorLog.visual_indicators?.includes('pseudocode_input')) {
        message += '. Please check your pseudocode input area.';
      } else if (errorLog.visual_indicators?.includes('language_selector')) {
        message += '. Please review your language selection.';
      }
      
      utterance.text = message;
    } else {
      utterance.text = 'Conversion completed successfully. All results are ready for review.';
    }
    
    speechSynthesis.speak(utterance);
  }, [audioFeedback]);

  // Handle conversion
  const handleConvert = useCallback(async () => {
    if (!pseudocode.trim()) {
      const error: ErrorLog = {
        id: Date.now(),
        request_id: null,
        error_type: 'validation_error',
        error_message: 'Empty pseudocode input',
        user_friendly_message: 'Please enter some pseudocode to convert',
        fix_suggestions: [
          'Type or paste your pseudocode in the input area',
          'Use the voice input button to speak your pseudocode',
          'Try the example pseudocode provided'
        ],
        avoid_suggestions: [
          'Do not leave the input area empty',
          'Avoid submitting without any content'
        ],
        visual_indicators: 'pseudocode_input',
        audio_feedback: 'error_sound',
        severity: 'medium',
        created_at: new Date()
      };
      setErrors([error]);
      playEnhancedAudioFeedback(error);
      return;
    }

    if (selectedLanguages.length === 0) {
      const error: ErrorLog = {
        id: Date.now(),
        request_id: null,
        error_type: 'validation_error',
        error_message: 'No target languages selected',
        user_friendly_message: 'Please select at least one programming language',
        fix_suggestions: [
          'Check at least one programming language from the list',
          'Python is recommended for beginners',
          'You can select multiple languages at once'
        ],
        avoid_suggestions: [
          'Do not proceed without selecting any languages',
          'Avoid unchecking all language options'
        ],
        visual_indicators: 'language_selector',
        audio_feedback: 'error_sound',
        severity: 'medium',
        created_at: new Date()
      };
      setErrors([error]);
      playEnhancedAudioFeedback(error);
      return;
    }

    setIsLoading(true);
    setProgress(0);
    setErrors([]);
    playAudioFeedback('info');

    // Simulate progress with realistic timing
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + Math.random() * 15 + 5; // Variable progress speed
      });
    }, 150);

    try {
      const conversionInput: CreateConversionRequestInput = {
        pseudocode,
        target_languages: selectedLanguages as (typeof supportedLanguages)[number][],
        include_flowchart: includeFlowchart,
        user_id: userId,
        accessibility_mode: accessibilityMode,
        voice_enabled: voiceEnabled
      };

      const result = await trpc.convertPseudocode.mutate(conversionInput);
      setConversionResult(result);
      setProgress(100);
      
      if (result.errors.length > 0) {
        setErrors(result.errors);
        result.errors.forEach(error => playEnhancedAudioFeedback(error));
      } else {
        playEnhancedAudioFeedback();
      }
    } catch {
      const errorLog: ErrorLog = {
        id: Date.now(),
        request_id: null,
        error_type: 'network_error',
        error_message: 'Failed to convert pseudocode',
        user_friendly_message: 'Something went wrong while converting your pseudocode',
        fix_suggestions: [
          'Check your internet connection',
          'Try again in a few moments',
          'Simplify your pseudocode if it\'s very complex',
          'Contact support if the problem persists'
        ],
        avoid_suggestions: [
          'Do not refresh the page immediately',
          'Avoid submitting the same request multiple times quickly'
        ],
        visual_indicators: 'alert_banner',
        audio_feedback: 'error_sound',
        severity: 'high',
        created_at: new Date()
      };
      setErrors([errorLog]);
      playEnhancedAudioFeedback(errorLog);
    } finally {
      clearInterval(progressInterval);
      setIsLoading(false);
      setProgress(0);
    }
  }, [pseudocode, selectedLanguages, includeFlowchart, userId, accessibilityMode, voiceEnabled, playAudioFeedback, playEnhancedAudioFeedback]);

  // Voice recognition
  const handleVoiceResult = useCallback((text: string) => {
    if (text.toLowerCase().includes('convert')) {
      handleConvert();
    } else if (text.toLowerCase().includes('clear')) {
      setPseudocode('');
      setConversionResult(null);
      setErrors([]);
    } else {
      setPseudocode(text);
    }
  }, [handleConvert]);

  const { startListening, stopListening, isListening, isSupported } = useVoiceRecognition(handleVoiceResult, voiceEnabled);

  // Update user settings
  const updateSettings = useCallback(async (updates: Partial<UpdateUserSettingsInput>) => {
    try {
      await trpc.updateUserSettings.mutate({
        user_id: userId,
        ...updates
      });
    } catch (settingsError) {
      console.error('Failed to update settings:', settingsError);
    }
  }, [userId]);

  // Handle language selection
  const handleLanguageToggle = useCallback((language: string) => {
    setSelectedLanguages(prev => {
      const newSelection = prev.includes(language)
        ? prev.filter(l => l !== language)
        : [...prev, language];
      
      updateSettings({ preferred_languages: newSelection as (typeof supportedLanguages)[number][] });
      return newSelection;
    });
  }, [updateSettings]);

  // Handle accessibility mode change
  const handleAccessibilityModeChange = useCallback((mode: typeof accessibilityMode) => {
    setAccessibilityMode(mode);
    updateSettings({ accessibility_mode: mode });
  }, [updateSettings]);

  // Handle voice toggle
  const handleVoiceToggle = useCallback((enabled: boolean) => {
    setVoiceEnabled(enabled);
    updateSettings({ voice_enabled: enabled });
  }, [updateSettings]);

  // Handle font size change
  const handleFontSizeChange = useCallback((size: number[]) => {
    const newSize = size[0];
    setFontSize(newSize);
    updateSettings({ font_size: newSize });
  }, [updateSettings]);

  // Handle high contrast toggle
  const handleHighContrastToggle = useCallback((enabled: boolean) => {
    setHighContrast(enabled);
    updateSettings({ high_contrast: enabled });
  }, [updateSettings]);

  // Handle audio feedback toggle
  const handleAudioFeedbackToggle = useCallback((enabled: boolean) => {
    setAudioFeedback(enabled);
    updateSettings({ audio_feedback: enabled });
  }, [updateSettings]);

  // Copy to clipboard
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      playAudioFeedback('success');
    } catch (clipboardError) {
      console.error('Failed to copy to clipboard:', clipboardError);
    }
  }, [playAudioFeedback]);

  // Apply accessibility styles
  const getAccessibilityClasses = () => {
    let classes = 'min-h-screen transition-all duration-300 ';
    
    switch (accessibilityMode) {
      case 'high_contrast':
        classes += 'bg-black text-white ';
        break;
      case 'large_text':
        classes += 'text-lg ';
        break;
      case 'simplified':
        classes += 'bg-gray-50 ';
        break;
      default:
        classes += 'bg-gradient-to-br from-blue-50 to-indigo-100 ';
    }
    
    if (highContrast) {
      classes += 'contrast-150 ';
    }
    
    return classes;
  };

  const availableLanguages = ['python', 'javascript', 'java', 'csharp', 'cpp', 'go', 'rust'];

  return (
    <div className={getAccessibilityClasses()} style={{ fontSize: `${fontSize}px` }}>
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            🚀 AI Pseudocode Converter
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Convert your pseudocode into multiple programming languages and flowcharts
          </p>
        </div>

        {/* Enhanced Error Display with Visual Indicators */}
        {errors.length > 0 && (
          <div className={`mb-6 space-y-3 ${getVisualIndicatorClasses('alert_banner')}`}>
            {errors.map((error: ErrorLog) => {
              const severityColors = {
                low: 'border-yellow-400 bg-yellow-50 text-yellow-800',
                medium: 'border-orange-400 bg-orange-50 text-orange-800', 
                high: 'border-red-500 bg-red-50 text-red-800',
                critical: 'border-red-600 bg-red-100 text-red-900'
              };
              
              const severityIcons = {
                low: '⚠️',
                medium: '⚠️',
                high: '🚨',
                critical: '🛑'
              };
              
              return (
                <Alert key={error.id} className={`${severityColors[error.severity]} transition-all duration-300 shadow-sm`}>
                  <AlertDescription>
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <span className="text-lg" role="img" aria-label={`${error.severity} severity error`}>
                          {severityIcons[error.severity]}
                        </span>
                        <div className="flex-1">
                          <p className="font-semibold mb-2">{error.user_friendly_message}</p>
                          
                          {/* Fix Suggestions */}
                          <div className="mb-3">
                            <div className="flex items-center gap-1 mb-2">
                              <span className="text-sm">✅</span>
                              <p className="text-sm font-medium text-green-700">What to do:</p>
                            </div>
                            <ul className="text-sm text-green-600 space-y-1 ml-4">
                              {error.fix_suggestions.map((suggestion: string, index: number) => (
                                <li key={index} className="flex items-start gap-2">
                                  <span className="text-green-500 mt-1">•</span>
                                  <span>{suggestion}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          
                          {/* Avoid Suggestions */}
                          <div>
                            <div className="flex items-center gap-1 mb-2">
                              <span className="text-sm">❌</span>
                              <p className="text-sm font-medium text-red-700">What to avoid:</p>
                            </div>
                            <ul className="text-sm text-red-600 space-y-1 ml-4">
                              {error.avoid_suggestions.map((suggestion: string, index: number) => (
                                <li key={index} className="flex items-start gap-2">
                                  <span className="text-red-500 mt-1">•</span>
                                  <span>{suggestion}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column - Input and Settings */}
          <div className="lg:col-span-1 space-y-6">
            {/* Accessibility Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">⚙️ Accessibility Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Display Mode</Label>
                  <Select value={accessibilityMode} onValueChange={handleAccessibilityModeChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="high_contrast">High Contrast</SelectItem>
                      <SelectItem value="large_text">Large Text</SelectItem>
                      <SelectItem value="simplified">Simplified</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Font Size: {fontSize}px</Label>
                  <Slider
                    value={[fontSize]}
                    onValueChange={handleFontSizeChange}
                    min={12}
                    max={24}
                    step={1}
                    className="w-full"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="high-contrast"
                    checked={highContrast}
                    onCheckedChange={handleHighContrastToggle}
                  />
                  <Label htmlFor="high-contrast">High Contrast</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="audio-feedback"
                    checked={audioFeedback}
                    onCheckedChange={handleAudioFeedbackToggle}
                  />
                  <Label htmlFor="audio-feedback">Audio Feedback</Label>
                </div>

                {isSupported && (
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="voice-enabled"
                      checked={voiceEnabled}
                      onCheckedChange={handleVoiceToggle}
                    />
                    <Label htmlFor="voice-enabled">Voice Control</Label>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Language Selection with Visual Error Indicators */}
            <Card className={getVisualIndicatorClasses('language_selector')}>
              <CardHeader>
                <CardTitle className="text-lg">🔧 Target Languages</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {availableLanguages.map((lang: string) => (
                    <div key={lang} className="flex items-center space-x-2">
                      <Checkbox
                        id={lang}
                        checked={selectedLanguages.includes(lang)}
                        onCheckedChange={(checked) => {
                          if (checked === true) {
                            handleLanguageToggle(lang);
                          } else if (checked === false) {
                            handleLanguageToggle(lang);
                          }
                        }}
                        className="focus-visible:ring-2 focus-visible:ring-blue-500"
                      />
                      <Label htmlFor={lang} className="capitalize cursor-pointer">
                        {lang === 'csharp' ? 'C#' : lang === 'cpp' ? 'C++' : lang}
                      </Label>
                    </div>
                  ))}
                </div>
                
                {/* Language Selection Status */}
                <div className="mt-3 p-2 bg-blue-50 rounded-md">
                  <p className="text-sm text-blue-700">
                    {selectedLanguages.length === 0 
                      ? '⚠️ No languages selected' 
                      : `✅ ${selectedLanguages.length} language${selectedLanguages.length > 1 ? 's' : ''} selected`
                    }
                  </p>
                </div>

                <Separator className="my-4" />

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="flowchart"
                    checked={includeFlowchart}
                    onCheckedChange={(checked) => {
                      if (checked === true) {
                        setIncludeFlowchart(true);
                      } else if (checked === false) {
                        setIncludeFlowchart(false);
                      }
                    }}
                    className="focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                  <Label htmlFor="flowchart" className="cursor-pointer">Include Mermaid Flowchart</Label>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Input and Output */}
          <div className="lg:col-span-3 space-y-6">
            {/* Input Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">📝 Pseudocode Input</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="relative">
                    <Textarea
                      value={pseudocode}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                        setPseudocode(e.target.value);
                        // Clear pseudocode-related errors when user starts typing
                        if (e.target.value.trim() && errors.some(err => err.visual_indicators?.includes('pseudocode_input'))) {
                          setErrors(prev => prev.filter(err => !err.visual_indicators?.includes('pseudocode_input')));
                        }
                      }}
                      placeholder="Enter your pseudocode here...&#10;&#10;Example:&#10;START&#10;INPUT number&#10;IF number > 0 THEN&#10;    PRINT 'Positive'&#10;ELSE IF number < 0 THEN&#10;    PRINT 'Negative'&#10;ELSE&#10;    PRINT 'Zero'&#10;END IF&#10;END"
                      className={`min-h-[200px] resize-none transition-all duration-200 ${getVisualIndicatorClasses('pseudocode_input')} focus-visible:ring-2 focus-visible:ring-blue-500`}
                      aria-describedby="pseudocode-help"
                    />
                    
                    {/* Character count and status */}
                    <div className="absolute bottom-2 left-2 text-xs text-gray-500 bg-white px-2 py-1 rounded">
                      {pseudocode.length} characters
                      {pseudocode.trim().length === 0 && (
                        <span className="text-red-500 ml-2">• Empty</span>
                      )}
                    </div>
                    
                    {voiceEnabled && isSupported && (
                      <Button
                        type="button"
                        variant={isListening ? "destructive" : "outline"}
                        size="sm"
                        className={`absolute top-2 right-2 transition-all duration-200 ${
                          isListening 
                            ? 'voice-listening animate-pulse border-red-500 shadow-lg shadow-red-500/50 ring-2 ring-red-300' 
                            : 'hover:border-blue-500 hover:shadow-md hover:shadow-blue-500/25'
                        }`}
                        onClick={isListening ? stopListening : startListening}
                        aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                      >
                        {isListening ? (
                          <span className="flex items-center gap-1">
                            <span className="animate-pulse">🔴</span>
                            <span>Recording</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <span>🎤</span>
                            <span>Voice</span>
                          </span>
                        )}
                      </Button>
                    )}
                  </div>
                  
                  {/* Pseudocode help text */}
                  <div id="pseudocode-help" className="text-sm text-gray-600 mt-2">
                    <p className="font-medium mb-1">💡 Pseudocode Tips:</p>
                    <ul className="text-xs space-y-1 list-disc list-inside">
                      <li>Use START/END to mark the beginning and end</li>
                      <li>Use INPUT/OUTPUT for user interaction</li>
                      <li>Use IF/THEN/ELSE for conditions</li>
                      <li>Use WHILE/FOR for loops</li>
                      <li>Keep statements simple and clear</li>
                    </ul>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={handleConvert}
                      disabled={isLoading || !pseudocode.trim()}
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                    >
                      {isLoading ? '⚡ Converting...' : '🚀 Convert'}
                    </Button>
                    
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPseudocode('');
                        setConversionResult(null);
                        setErrors([]);
                      }}
                    >
                      🗑️ Clear
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => {
                        const example = `START
INPUT number
IF number > 0 THEN
    PRINT 'Positive'
ELSE IF number < 0 THEN
    PRINT 'Negative'
ELSE
    PRINT 'Zero'
END IF
END`;
                        setPseudocode(example);
                      }}
                    >
                      📋 Example
                    </Button>
                  </div>

                  {isLoading && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Converting pseudocode...</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="w-full" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Output Section */}
            {conversionResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">📤 Conversion Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="code" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="code">Generated Code</TabsTrigger>
                      <TabsTrigger value="flowchart" disabled={!includeFlowchart}>
                        Flowchart
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="code" className="space-y-4">
                      {conversionResult.results
                        .filter((result: ConversionResult) => result.language !== 'mermaid')
                        .map((result: ConversionResult) => (
                          <Card key={result.id} className="overflow-hidden">
                            <CardHeader className="pb-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="capitalize">
                                    {result.language === 'csharp' ? 'C#' : result.language === 'cpp' ? 'C++' : result.language}
                                  </Badge>
                                  {result.success ? (
                                    <Badge variant="default" className="bg-green-500">
                                      ✅ Success
                                    </Badge>
                                  ) : (
                                    <Badge variant="destructive">
                                      ❌ Failed
                                    </Badge>
                                  )}
                                  <span className="text-xs text-gray-500">
                                    {result.execution_time_ms}ms
                                  </span>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyToClipboard(result.generated_code)}
                                >
                                  📋 Copy
                                </Button>
                              </div>
                            </CardHeader>
                            <CardContent>
                              {result.success ? (
                                <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-x-auto text-sm">
                                  <code>{result.generated_code}</code>
                                </pre>
                              ) : (
                                <div className="bg-red-50 border border-red-200 p-4 rounded-md">
                                  <p className="text-red-700 font-medium">Conversion Failed</p>
                                  <p className="text-red-600 text-sm mt-1">
                                    {result.error_message || 'Unknown error occurred'}
                                  </p>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                    </TabsContent>

                    <TabsContent value="flowchart">
                      {conversionResult.results
                        .filter((result: ConversionResult) => result.language === 'mermaid')
                        .map((result: ConversionResult) => (
                          <Card key={result.id} className="overflow-hidden">
                            <CardHeader className="pb-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">Mermaid Flowchart</Badge>
                                  {result.success ? (
                                    <Badge variant="default" className="bg-green-500">
                                      ✅ Success
                                    </Badge>
                                  ) : (
                                    <Badge variant="destructive">
                                      ❌ Failed
                                    </Badge>
                                  )}
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyToClipboard(result.generated_code)}
                                >
                                  📋 Copy
                                </Button>
                              </div>
                            </CardHeader>
                            <CardContent>
                              {result.success ? (
                                <div className="space-y-3">
                                  <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Copy this Mermaid syntax to visualize your flowchart:
                                  </p>
                                  <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-x-auto text-sm">
                                    <code>{result.generated_code}</code>
                                  </pre>
                                  <p className="text-xs text-gray-500">
                                    💡 Tip: Use online Mermaid editors or supported platforms to render this flowchart
                                  </p>
                                </div>
                              ) : (
                                <div className="bg-red-50 border border-red-200 p-4 rounded-md">
                                  <p className="text-red-700 font-medium">Flowchart Generation Failed</p>
                                  <p className="text-red-600 text-sm mt-1">
                                    {result.error_message || 'Unknown error occurred'}
                                  </p>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
