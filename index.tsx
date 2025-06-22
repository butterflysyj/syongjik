
import React, { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react';
import ReactDOM from 'react-dom/client';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx'; // For XLSX and CSV
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// pdf.js worker setup
if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.3.136/build/pdf.worker.mjs';
}

// --- Theme Context ---
interface ThemeContextType {
    isDarkMode: boolean;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

const ThemeProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const stored = localStorage.getItem('theme');
        return stored ? stored === 'dark' : true; // Default to dark mode
    });

    const toggleTheme = useCallback(() => {
        setIsDarkMode(prev => {
            const newMode = !prev;
            localStorage.setItem('theme', newMode ? 'dark' : 'light');
            return newMode;
        });
    }, []);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', isDarkMode);
        document.body.className = isDarkMode 
            ? 'bg-slate-900 text-slate-200 font-[Noto Sans KR] flex justify-center items-start min-h-screen p-4 sm:p-8'
            : 'bg-gray-50 text-gray-800 font-[Noto Sans KR] flex justify-center items-start min-h-screen p-4 sm:p-8';
    }, [isDarkMode]);

    return (
        <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

// --- Advanced Speech System ---
interface SpeechContextType {
    speak: (text: string, lang?: string, rate?: number) => Promise<void>;
    isSpeaking: boolean;
    stopSpeaking: () => void;
    isSupported: boolean;
    availableVoices: SpeechSynthesisVoice[];
    selectedVoice: SpeechSynthesisVoice | null;
    setSelectedVoice: (voice: SpeechSynthesisVoice | null) => void;
}

const SpeechContext = createContext<SpeechContextType | undefined>(undefined);

export const useSpeech = () => {
    const context = useContext(SpeechContext);
    if (!context) {
        throw new Error('useSpeech must be used within a SpeechProvider');
    }
    return context;
};

const SpeechProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
    const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

    useEffect(() => {
        if (isSupported) {
            const loadVoices = () => {
                const voices = speechSynthesis.getVoices();
                setAvailableVoices(voices);
                
                // Auto-select best English voice
                const englishVoices = voices.filter(voice => voice.lang.startsWith('en'));
                const preferredVoice = englishVoices.find(voice => 
                    voice.name.toLowerCase().includes('google') || 
                    voice.name.toLowerCase().includes('natural') ||
                    voice.name.toLowerCase().includes('enhanced')
                ) || englishVoices[0];
                
                if (preferredVoice && !selectedVoice) {
                    setSelectedVoice(preferredVoice);
                }
            };

            loadVoices();
            speechSynthesis.addEventListener('voiceschanged', loadVoices);
            
            return () => speechSynthesis.removeEventListener('voiceschanged', loadVoices);
        }
    }, [isSupported, selectedVoice]);

    const speak = useCallback(async (text: string, lang = 'en-US', rate = 0.9): Promise<void> => {
        if (!isSupported) return;
        
        speechSynthesis.cancel(); // Stop any ongoing speech
        
        return new Promise((resolve) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = lang;
            utterance.rate = rate;
            utterance.pitch = 1;
            utterance.volume = 0.8;
            
            if (selectedVoice) {
                utterance.voice = selectedVoice;
            }
            
            utterance.onstart = () => setIsSpeaking(true);
            utterance.onend = () => {
                setIsSpeaking(false);
                resolve();
            };
            utterance.onerror = () => {
                setIsSpeaking(false);
                resolve();
            };
            
            speechSynthesis.speak(utterance);
        });
    }, [isSupported, selectedVoice]);

    const stopSpeaking = useCallback(() => {
        if (isSupported) {
            speechSynthesis.cancel();
            setIsSpeaking(false);
        }
    }, [isSupported]);

    return (
        <SpeechContext.Provider value={{
            speak,
            isSpeaking,
            stopSpeaking,
            isSupported,
            availableVoices,
            selectedVoice,
            setSelectedVoice
        }}>
            {children}
        </SpeechContext.Provider>
    );
};

// --- Toast Notification System ---
interface ToastMessage {
    id: number;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
}
interface ToastContextType {
    addToast: (message: string, type: ToastMessage['type']) => void;
}
const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToasts = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToasts must be used within a ToastProvider');
    }
    return context;
};

const ToastProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const toastIdRef = useRef(0);

    const addToast = useCallback((message: string, type: ToastMessage['type']) => {
        const id = toastIdRef.current++;
        setToasts(prevToasts => [...prevToasts, { id, message, type }]);
        const duration = type === 'error' || type === 'warning' ? 7000 : 5000;
        setTimeout(() => {
            removeToast(id);
        }, duration);
    }, []);

    const removeToast = (id: number) => {
        setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
    };

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div className="fixed top-5 right-5 z-[100] w-full max-w-xs sm:max-w-sm space-y-3">
                {toasts.map(toast => (
                    <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => removeToast(toast.id)} />
                ))}
            </div>
        </ToastContext.Provider>
    );
};

interface ToastProps {
    message: string;
    type: ToastMessage['type'];
    onClose: () => void;
}
const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
    const [isExiting, setIsExiting] = useState(false);

    const bgColor = useMemo(() => {
        switch (type) {
            case 'success': return 'bg-green-500';
            case 'error': return 'bg-red-500';
            case 'warning': return 'bg-yellow-500';
            case 'info': return 'bg-blue-500';
            default: return 'bg-slate-600';
        }
    }, [type]);

    const icon = useMemo(() => {
        switch (type) {
            case 'success': return '✔️';
            case 'error': return '❌';
            case 'warning': return '⚠️';
            case 'info': return 'ℹ️';
            default: return '';
        }
    }, [type]);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(onClose, 300); 
    };

    return (
        <div 
            role="alert" 
            aria-live={type === 'error' ? 'assertive' : 'polite'}
            className={`flex items-start justify-between p-4 rounded-md shadow-lg text-white ${bgColor} ${isExiting ? 'animate-slideOutRight' : 'animate-slideInRight'}`}
        >
            <div className="flex items-center">
                {icon && <span className="mr-2 text-lg">{icon}</span>}
                <p className="text-sm">{message}</p>
            </div>
            <button onClick={handleClose} aria-label="Close notification" className="ml-4 p-1 rounded-md hover:bg-black/20 focus:outline-none focus:ring-2 focus:ring-white/50 text-xl leading-none">&times;</button>
        </div>
    );
};


// --- Global Loading Indicator ---
const GlobalSpinner: React.FC<{ isLoading: boolean }> = ({ isLoading }) => {
    if (!isLoading) return null;
    return (
        <div className="fixed top-4 right-4 z-[200] p-2 bg-slate-700/80 rounded-full shadow-lg" aria-label="Loading content" role="status">
            <svg className="animate-spin h-6 w-6 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
        </div>
    );
};


// Define types for user settings
interface UserSettings {
    grade: string;
    textbook: string; 
    dailyGoal: number;
    username: string;
}

// Define props for screen components
interface ScreenProps {
    userSettings: UserSettings;
    onNavigate: (screen: AppScreen, params?: any) => void;
    currentScreen?: AppScreen; 
    setGlobalLoading: (loading: boolean) => void; 
    addToast: (message: string, type: ToastMessage['type']) => void;
    openSettingsModal: () => void; // Added for opening settings modal
}

type AppScreen = 'loginSetup' | 'dashboard' | 'learnWords' | 'quiz' | 'allWords' | 'stats' | 'manageWords';

interface Word {
    id: number | string; 
    term: string; 
    pronunciation?: string; 
    partOfSpeech: string; 
    meaning: string; 
    exampleSentence: string;
    exampleSentenceMeaning?: string; 
    gradeLevel: string; 
    isCustom?: boolean; 
}

interface WordStat {
    id: number | string;
    isMastered: boolean;
    lastReviewed: string | null; 
    quizIncorrectCount: number;
}


const sampleWords: Word[] = [
    // OCR Page 1 Words (1-60) -> gradeLevel: "middle1"
    { id: 1, term: "person", partOfSpeech: "명사", meaning: "사람", exampleSentence: "This is a person.", exampleSentenceMeaning: "이것은 사람입니다.", gradeLevel: "middle1" },
    { id: 2, term: "life", partOfSpeech: "명사", meaning: "삶, 생명", exampleSentence: "This is a life.", exampleSentenceMeaning: "이것은 삶입니다.", gradeLevel: "middle1" },
    { id: 3, term: "job", partOfSpeech: "명사", meaning: "일, 직업", exampleSentence: "This is a job.", exampleSentenceMeaning: "이것은 일입니다.", gradeLevel: "middle1" },
    { id: 4, term: "country", partOfSpeech: "명사", meaning: "국가, 시골", exampleSentence: "This is a country.", exampleSentenceMeaning: "이것은 국가입니다.", gradeLevel: "middle1" },
    { id: 5, term: "earth", partOfSpeech: "명사", meaning: "지구, 흙", exampleSentence: "This is an earth.", exampleSentenceMeaning: "이것은 지구입니다.", gradeLevel: "middle1" },
    { id: 6, term: "problem", partOfSpeech: "명사", meaning: "문제", exampleSentence: "This is a problem.", exampleSentenceMeaning: "이것은 문제입니다.", gradeLevel: "middle1" },
    { id: 7, term: "way", partOfSpeech: "명사", meaning: "길, 방법", exampleSentence: "This is a way.", exampleSentenceMeaning: "이것은 길입니다.", gradeLevel: "middle1" },
    { id: 8, term: "language", partOfSpeech: "명사", meaning: "언어", exampleSentence: "This is a language.", exampleSentenceMeaning: "이것은 언어입니다.", gradeLevel: "middle1" },
    { id: 9, term: "story", partOfSpeech: "명사", meaning: "이야기, 충", exampleSentence: "This is a story.", exampleSentenceMeaning: "이것은 이야기입니다.", gradeLevel: "middle1" },
    { id: 10, term: "lot", partOfSpeech: "명사", meaning: "운, 운세", exampleSentence: "This is a lot.", exampleSentenceMeaning: "이것은 운입니다.", gradeLevel: "middle1" },
    { id: 11, term: "name", partOfSpeech: "명사", meaning: "이름", exampleSentence: "This is a name.", exampleSentenceMeaning: "이것은 이름입니다.", gradeLevel: "middle1" },
    { id: 12, term: "hand", partOfSpeech: "명사", meaning: "손, 건네다", exampleSentence: "This is a hand.", exampleSentenceMeaning: "이것은 손입니다.", gradeLevel: "middle1" },
    { id: 13, term: "place", partOfSpeech: "명사", meaning: "장소", exampleSentence: "This is a place.", exampleSentenceMeaning: "이것은 장소입니다.", gradeLevel: "middle1" },
    { id: 14, term: "practice", partOfSpeech: "명사", meaning: "연습, 실천", exampleSentence: "This is a practice.", exampleSentenceMeaning: "이것은 연습입니다.", gradeLevel: "middle1" },
    { id: 15, term: "work", partOfSpeech: "명사", meaning: "일, 작품", exampleSentence: "This is a work.", exampleSentenceMeaning: "이것은 일입니다.", gradeLevel: "middle1" },
    { id: 16, term: "use", partOfSpeech: "동사", meaning: "사용하다", exampleSentence: "I like to use.", exampleSentenceMeaning: "나는 사용하는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 17, term: "kind", partOfSpeech: "형용사", meaning: "친절한, 종류", exampleSentence: "It is very kind.", exampleSentenceMeaning: "그것은 매우 친절한합니다.", gradeLevel: "middle1" },
    { id: 18, term: "fun", partOfSpeech: "명사", meaning: "재미", exampleSentence: "This is fun.", exampleSentenceMeaning: "이것은 재미입니다.", gradeLevel: "middle1" },
    { id: 19, term: "future", partOfSpeech: "명사", meaning: "미래", exampleSentence: "This is the future.", exampleSentenceMeaning: "이것은 미래입니다.", gradeLevel: "middle1" },
    { id: 20, term: "have", partOfSpeech: "동사", meaning: "가지다", exampleSentence: "I like to have.", exampleSentenceMeaning: "나는 가지는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 21, term: "make", partOfSpeech: "동사", meaning: "만들다", exampleSentence: "I like to make.", exampleSentenceMeaning: "나는 만드는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 22, term: "let", partOfSpeech: "동사", meaning: "~하게 해주다", exampleSentence: "I like to let.", exampleSentenceMeaning: "나는 ~하게 해주는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 23, term: "get", partOfSpeech: "동사", meaning: "얻다, 취하다", exampleSentence: "I like to get.", exampleSentenceMeaning: "나는 얻는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 24, term: "take", partOfSpeech: "동사", meaning: "가져가다", exampleSentence: "I like to take.", exampleSentenceMeaning: "나는 가져가는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 25, term: "different", partOfSpeech: "형용사", meaning: "다른, 다양한", exampleSentence: "It is very different.", exampleSentenceMeaning: "그것은 매우 다른합니다.", gradeLevel: "middle1" },
    { id: 26, term: "important", partOfSpeech: "형용사", meaning: "중요한", exampleSentence: "It is very important.", exampleSentenceMeaning: "그것은 매우 중요한합니다.", gradeLevel: "middle1" },
    { id: 27, term: "right", partOfSpeech: "형용사", meaning: "옳은, 권리", exampleSentence: "It is very right.", exampleSentenceMeaning: "그것은 매우 옳은합니다.", gradeLevel: "middle1" },
    { id: 28, term: "sure", partOfSpeech: "형용사", meaning: "확실한", exampleSentence: "It is very sure.", exampleSentenceMeaning: "그것은 매우 확실한합니다.", gradeLevel: "middle1" },
    { id: 29, term: "well", partOfSpeech: "부사", meaning: "잘, 우물", exampleSentence: "He works well.", exampleSentenceMeaning: "그는 잘 일해요.", gradeLevel: "middle1" },
    { id: 30, term: "hard", partOfSpeech: "형용사", meaning: "딱딱한, 열심히", exampleSentence: "It is very hard.", exampleSentenceMeaning: "그것은 매우 딱딱한합니다.", gradeLevel: "middle1" },
    { id: 31, term: "clothes", partOfSpeech: "명사", meaning: "천, 옷감", exampleSentence: "These are clothes.", exampleSentenceMeaning: "이것들은 천입니다.", gradeLevel: "middle1" },
    { id: 32, term: "movie", partOfSpeech: "명사", meaning: "영화", exampleSentence: "This is a movie.", exampleSentenceMeaning: "이것은 영화입니다.", gradeLevel: "middle1" },
    { id: 33, term: "activity", partOfSpeech: "명사", meaning: "활동", exampleSentence: "This is an activity.", exampleSentenceMeaning: "이것은 활동입니다.", gradeLevel: "middle1" },
    { id: 34, term: "example", partOfSpeech: "명사", meaning: "예, 사례", exampleSentence: "This is an example.", exampleSentenceMeaning: "이것은 예입니다.", gradeLevel: "middle1" },
    { id: 35, term: "dialogue", partOfSpeech: "명사", meaning: "대화", exampleSentence: "This is a dialogue.", exampleSentenceMeaning: "이것은 대화입니다.", gradeLevel: "middle1" },
    { id: 36, term: "letter", partOfSpeech: "명사", meaning: "편지", exampleSentence: "This is a letter.", exampleSentenceMeaning: "이것은 편지입니다.", gradeLevel: "middle1" },
    { id: 37, term: "fire", partOfSpeech: "명사", meaning: "불, 해고하다", exampleSentence: "This is a fire.", exampleSentenceMeaning: "이것은 불입니다.", gradeLevel: "middle1" },
    { id: 38, term: "minute", partOfSpeech: "명사", meaning: "분", exampleSentence: "This is a minute.", exampleSentenceMeaning: "이것은 분입니다.", gradeLevel: "middle1" },
    { id: 39, term: "part", partOfSpeech: "명사", meaning: "부분, 일부", exampleSentence: "This is a part.", exampleSentenceMeaning: "이것은 부분입니다.", gradeLevel: "middle1" },
    { id: 40, term: "plan", partOfSpeech: "명사", meaning: "계획", exampleSentence: "This is a plan.", exampleSentenceMeaning: "이것은 계획입니다.", gradeLevel: "middle1" },
    { id: 41, term: "plant", partOfSpeech: "명사", meaning: "식물, 심다", exampleSentence: "This is a plant.", exampleSentenceMeaning: "이것은 식물입니다.", gradeLevel: "middle1" },
    { id: 42, term: "park", partOfSpeech: "명사", meaning: "공원, 주차하다", exampleSentence: "This is a park.", exampleSentenceMeaning: "이것은 공원입니다.", gradeLevel: "middle1" },
    { id: 43, term: "call", partOfSpeech: "동사", meaning: "부르다, 전화하다", exampleSentence: "I like to call.", exampleSentenceMeaning: "나는 부르는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 44, term: "try", partOfSpeech: "동사", meaning: "노력하다", exampleSentence: "I like to try.", exampleSentenceMeaning: "나는 노력하는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 45, term: "need", partOfSpeech: "동사", meaning: "필요로 하다", exampleSentence: "I like to need.", exampleSentenceMeaning: "나는 필요로 하는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 46, term: "keep", partOfSpeech: "동사", meaning: "지키다, 유지하다", exampleSentence: "I like to keep.", exampleSentenceMeaning: "나는 지키는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 47, term: "listen", partOfSpeech: "동사", meaning: "듣다", exampleSentence: "I like to listen.", exampleSentenceMeaning: "나는 듣는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 48, term: "find", partOfSpeech: "동사", meaning: "찾다, 발견하다", exampleSentence: "I like to find.", exampleSentenceMeaning: "나는 찾는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 49, term: "learn", partOfSpeech: "동사", meaning: "배우다", exampleSentence: "I like to learn.", exampleSentenceMeaning: "나는 배우는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 50, term: "live", partOfSpeech: "동사", meaning: "살다", exampleSentence: "I like to live.", exampleSentenceMeaning: "나는 사는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 51, term: "mean", partOfSpeech: "동사", meaning: "의미하다", exampleSentence: "I like to mean.", exampleSentenceMeaning: "나는 의미하는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 52, term: "last", partOfSpeech: "동사", meaning: "지속하다", exampleSentence: "I like to last.", exampleSentenceMeaning: "나는 지속하는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 53, term: "any", partOfSpeech: "형용사", meaning: "어떤", exampleSentence: "It is very any.", exampleSentenceMeaning: "그것은 매우 어떤합니다.", gradeLevel: "middle1" },
    { id: 54, term: "each", partOfSpeech: "형용사", meaning: "각각의", exampleSentence: "It is very each.", exampleSentenceMeaning: "그것은 매우 각각의합니다.", gradeLevel: "middle1" },
    { id: 55, term: "other", partOfSpeech: "형용사", meaning: "다른", exampleSentence: "It is very other.", exampleSentenceMeaning: "그것은 매우 다른합니다.", gradeLevel: "middle1" },
    { id: 56, term: "another", partOfSpeech: "형용사", meaning: "또 다른", exampleSentence: "It is very another.", exampleSentenceMeaning: "그것은 매우 또 다른합니다.", gradeLevel: "middle1" },
    { id: 57, term: "same", partOfSpeech: "형용사", meaning: "같은", exampleSentence: "It is very same.", exampleSentenceMeaning: "그것은 매우 같은합니다.", gradeLevel: "middle1" },
    { id: 58, term: "too", partOfSpeech: "부사", meaning: "또한, 너무", exampleSentence: "He works too.", exampleSentenceMeaning: "그는 또한 일해요.", gradeLevel: "middle1" },
    { id: 59, term: "also", partOfSpeech: "부사", meaning: "또한", exampleSentence: "He works also.", exampleSentenceMeaning: "그는 또한 일해요.", gradeLevel: "middle1" },
    { id: 60, term: "really", partOfSpeech: "부사", meaning: "정말로", exampleSentence: "He works really.", exampleSentenceMeaning: "그는 정말로 일해요.", gradeLevel: "middle1" },
    { id: 61, term: "bird", partOfSpeech: "명사", meaning: "새", exampleSentence: "This is a bird.", exampleSentenceMeaning: "이것은 새입니다.", gradeLevel: "middle1" },
    { id: 62, term: "restaurant", partOfSpeech: "명사", meaning: "식당", exampleSentence: "This is a restaurant.", exampleSentenceMeaning: "이것은 식당입니다.", gradeLevel: "middle1" },
    { id: 63, term: "trip", partOfSpeech: "명사", meaning: "여행, 출장", exampleSentence: "This is a trip.", exampleSentenceMeaning: "이것은 여행입니다.", gradeLevel: "middle1" },
    { id: 64, term: "vacation", partOfSpeech: "명사", meaning: "휴가, 방학", exampleSentence: "This is a vacation.", exampleSentenceMeaning: "이것은 휴가입니다.", gradeLevel: "middle1" },
    { id: 65, term: "space", partOfSpeech: "명사", meaning: "공간, 우주", exampleSentence: "This is a space.", exampleSentenceMeaning: "이것은 공간입니다.", gradeLevel: "middle1" },
    { id: 66, term: "street", partOfSpeech: "명사", meaning: "거리", exampleSentence: "This is a street.", exampleSentenceMeaning: "이것은 거리입니다.", gradeLevel: "middle1" },
    { id: 67, term: "side", partOfSpeech: "명사", meaning: "측, 입장", exampleSentence: "This is a side.", exampleSentenceMeaning: "이것은 측입니다.", gradeLevel: "middle1" },
    { id: 68, term: "paper", partOfSpeech: "명사", meaning: "종이", exampleSentence: "This is a paper.", exampleSentenceMeaning: "이것은 종이입니다.", gradeLevel: "middle1" },
    { id: 69, term: "newspaper", partOfSpeech: "명사", meaning: "신문", exampleSentence: "This is a newspaper.", exampleSentenceMeaning: "이것은 신문입니다.", gradeLevel: "middle1" },
    { id: 70, term: "face", partOfSpeech: "명사", meaning: "얼굴, 마주하다", exampleSentence: "This is a face.", exampleSentenceMeaning: "이것은 얼굴입니다.", gradeLevel: "middle1" },
    { id: 71, term: "mind", partOfSpeech: "명사", meaning: "마음, 꺼리다", exampleSentence: "This is a mind.", exampleSentenceMeaning: "이것은 마음입니다.", gradeLevel: "middle1" },
    { id: 72, term: "change", partOfSpeech: "동사", meaning: "변화하다", exampleSentence: "I like to change.", exampleSentenceMeaning: "나는 변화하는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 73, term: "visit", partOfSpeech: "동사", meaning: "방문하다", exampleSentence: "I like to visit.", exampleSentenceMeaning: "나는 방문하는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 74, term: "start", partOfSpeech: "동사", meaning: "시작하다", exampleSentence: "I like to start.", exampleSentenceMeaning: "나는 시작하는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 75, term: "watch", partOfSpeech: "동사", meaning: "주시하다", exampleSentence: "I like to watch.", exampleSentenceMeaning: "나는 주시하는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 76, term: "light", partOfSpeech: "명사", meaning: "빛, 가벼운", exampleSentence: "This is a light.", exampleSentenceMeaning: "이것은 빛입니다.", gradeLevel: "middle1" },
    { id: 77, term: "present", partOfSpeech: "명사", meaning: "현재, 선물", exampleSentence: "This is a present.", exampleSentenceMeaning: "이것은 현재입니다.", gradeLevel: "middle1" },
    { id: 78, term: "middle", partOfSpeech: "명사", meaning: "중간의", exampleSentence: "This is the middle.", exampleSentenceMeaning: "이것은 중간의입니다.", gradeLevel: "middle1" },
    { id: 79, term: "favorite", partOfSpeech: "형용사", meaning: "좋아하는", exampleSentence: "It is very favorite.", exampleSentenceMeaning: "그것은 매우 좋아하는합니다.", gradeLevel: "middle1" },
    { id: 80, term: "enjoy", partOfSpeech: "동사", meaning: "즐기다", exampleSentence: "I like to enjoy.", exampleSentenceMeaning: "나는 즐기는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 81, term: "win", partOfSpeech: "동사", meaning: "이기다, 획득하다", exampleSentence: "I like to win.", exampleSentenceMeaning: "나는 이기는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 82, term: "understand", partOfSpeech: "동사", meaning: "이해하다", exampleSentence: "I like to understand.", exampleSentenceMeaning: "나는 이해하는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 83, term: "warm", partOfSpeech: "형용사", meaning: "따뜻한", exampleSentence: "It is very warm.", exampleSentenceMeaning: "그것은 매우 따뜻한합니다.", gradeLevel: "middle1" },
    { id: 84, term: "clean", partOfSpeech: "동사", meaning: "청소하다", exampleSentence: "I like to clean.", exampleSentenceMeaning: "나는 청소하는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 85, term: "own", partOfSpeech: "형용사", meaning: "자신의, 소유하다", exampleSentence: "It is very own.", exampleSentenceMeaning: "그것은 매우 자신의합니다.", gradeLevel: "middle1" },
    { id: 86, term: "interesting", partOfSpeech: "형용사", meaning: "흥미로운", exampleSentence: "It is very interesting.", exampleSentenceMeaning: "그것은 매우 흥미로운합니다.", gradeLevel: "middle1" },
    { id: 87, term: "famous", partOfSpeech: "형용사", meaning: "유명한", exampleSentence: "It is very famous.", exampleSentenceMeaning: "그것은 매우 유명한합니다.", gradeLevel: "middle1" },
    { id: 88, term: "special", partOfSpeech: "형용사", meaning: "특별한", exampleSentence: "It is very special.", exampleSentenceMeaning: "그것은 매우 특별한합니다.", gradeLevel: "middle1" },
    { id: 89, term: "fast", partOfSpeech: "형용사", meaning: "빠른", exampleSentence: "It is very fast.", exampleSentenceMeaning: "그것은 매우 빠른합니다.", gradeLevel: "middle1" },
    { id: 90, term: "only", partOfSpeech: "부사", meaning: "오직, 유일한", exampleSentence: "He works only.", exampleSentenceMeaning: "그는 오직 일해요.", gradeLevel: "middle1" },
    { id: 91, term: "nature", partOfSpeech: "명사", meaning: "자연, 본성", exampleSentence: "This is nature.", exampleSentenceMeaning: "이것은 자연입니다.", gradeLevel: "middle1" },
    { id: 92, term: "state", partOfSpeech: "명사", meaning: "상태, 진술하다", exampleSentence: "This is a state.", exampleSentenceMeaning: "이것은 상태입니다.", gradeLevel: "middle1" },
    { id: 93, term: "island", partOfSpeech: "명사", meaning: "섬", exampleSentence: "This is an island.", exampleSentenceMeaning: "이것은 섬입니다.", gradeLevel: "middle1" },
    { id: 94, term: "group", partOfSpeech: "명사", meaning: "무리, 무리 짓다", exampleSentence: "This is a group.", exampleSentenceMeaning: "이것은 무리입니다.", gradeLevel: "middle1" },
    { id: 95, term: "soldier", partOfSpeech: "명사", meaning: "군인", exampleSentence: "This is a soldier.", exampleSentenceMeaning: "이것은 군인입니다.", gradeLevel: "middle1" },
    { id: 96, term: "habit", partOfSpeech: "명사", meaning: "습관", exampleSentence: "This is a habit.", exampleSentenceMeaning: "이것은 습관입니다.", gradeLevel: "middle1" },
    { id: 97, term: "culture", partOfSpeech: "명사", meaning: "문화", exampleSentence: "This is a culture.", exampleSentenceMeaning: "이것은 문화입니다.", gradeLevel: "middle1" },
    { id: 98, term: "history", partOfSpeech: "명사", meaning: "역사", exampleSentence: "This is history.", exampleSentenceMeaning: "이것은 역사입니다.", gradeLevel: "middle1" },
    { id: 99, term: "information", partOfSpeech: "명사", meaning: "정보", exampleSentence: "This is information.", exampleSentenceMeaning: "이것은 정보입니다.", gradeLevel: "middle1" },
    { id: 100, term: "advertisement", partOfSpeech: "명사", meaning: "광고", exampleSentence: "This is an advertisement.", exampleSentenceMeaning: "이것은 광고입니다.", gradeLevel: "middle1" },
    { id: 101, term: "science", partOfSpeech: "명사", meaning: "과학", exampleSentence: "This is science.", exampleSentenceMeaning: "이것은 과학입니다.", gradeLevel: "middle1" },
    { id: 102, term: "war", partOfSpeech: "명사", meaning: "전쟁", exampleSentence: "This is a war.", exampleSentenceMeaning: "이것은 전쟁입니다.", gradeLevel: "middle1" },
    { id: 103, term: "store", partOfSpeech: "명사", meaning: "상점, 저장하다", exampleSentence: "This is a store.", exampleSentenceMeaning: "이것은 상점입니다.", gradeLevel: "middle1" },
    { id: 104, term: "sound", partOfSpeech: "명사", meaning: "소리, 들리다", exampleSentence: "This is a sound.", exampleSentenceMeaning: "이것은 소리입니다.", gradeLevel: "middle1" },
    { id: 105, term: "point", partOfSpeech: "명사", meaning: "핵심, 가리키다", exampleSentence: "This is a point.", exampleSentenceMeaning: "이것은 핵심입니다.", gradeLevel: "middle1" },
    { id: 106, term: "land", partOfSpeech: "동사", meaning: "착륙하다", exampleSentence: "I like to land.", exampleSentenceMeaning: "나는 착륙하는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 107, term: "turn", partOfSpeech: "동사", meaning: "차례, 회전하다", exampleSentence: "I like to turn.", exampleSentenceMeaning: "나는 차례는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 108, term: "fly", partOfSpeech: "동사", meaning: "날다, 파리", exampleSentence: "I like to fly.", exampleSentenceMeaning: "나는 나는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 109, term: "begin", partOfSpeech: "동사", meaning: "시작하다", exampleSentence: "I like to begin.", exampleSentenceMeaning: "나는 시작하는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 110, term: "grow", partOfSpeech: "동사", meaning: "자라다", exampleSentence: "I like to grow.", exampleSentenceMeaning: "나는 자라는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 111, term: "believe", partOfSpeech: "동사", meaning: "믿다", exampleSentence: "I like to believe.", exampleSentenceMeaning: "나는 믿는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 112, term: "worry", partOfSpeech: "동사", meaning: "걱정하다", exampleSentence: "I like to worry.", exampleSentenceMeaning: "나는 걱정하는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 113, term: "save", partOfSpeech: "동사", meaning: "구하다, 저장하다", exampleSentence: "I like to save.", exampleSentenceMeaning: "나는 구하는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 114, term: "please", partOfSpeech: "동사", meaning: "만족시키다", exampleSentence: "I like to please.", exampleSentenceMeaning: "나는 만족시키는 것을 좋아해요.", gradeLevel: "middle1" },
    { id: 115, term: "easy", partOfSpeech: "형용사", meaning: "쉬운", exampleSentence: "It is very easy.", exampleSentenceMeaning: "그것은 매우 쉬운합니다.", gradeLevel: "middle1" },
    { id: 116, term: "poor", partOfSpeech: "형용사", meaning: "가난한, 어설픈", exampleSentence: "It is very poor.", exampleSentenceMeaning: "그것은 매우 가난한합니다.", gradeLevel: "middle1" },
    { id: 117, term: "such", partOfSpeech: "형용사", meaning: "그러한, 그렇게", exampleSentence: "It is very such.", exampleSentenceMeaning: "그것은 매우 그러한합니다.", gradeLevel: "middle1" },
    { id: 118, term: "just", partOfSpeech: "부사", meaning: "단지, 정당한", exampleSentence: "He works just.", exampleSentenceMeaning: "그는 단지 일해요.", gradeLevel: "middle1" },
    { id: 119, term: "back", partOfSpeech: "명사", meaning: "뒤, 등", exampleSentence: "This is the back.", exampleSentenceMeaning: "이것은 뒤입니다.", gradeLevel: "middle1" },
    { id: 120, term: "always", partOfSpeech: "부사", meaning: "항상", exampleSentence: "He works always.", exampleSentenceMeaning: "그는 항상 일해요.", gradeLevel: "middle1" },
    { id: 121, term: "village", partOfSpeech: "명사", meaning: "마을", exampleSentence: "This is a village.", exampleSentenceMeaning: "이것은 마을입니다.", gradeLevel: "middle2" },
    { id: 122, term: "forest", partOfSpeech: "명사", meaning: "숲", exampleSentence: "This is a forest.", exampleSentenceMeaning: "이것은 숲입니다.", gradeLevel: "middle2" },
    { id: 123, term: "leaf", partOfSpeech: "명사", meaning: "나뭇잎", exampleSentence: "This is a leaf.", exampleSentenceMeaning: "이것은 나뭇잎입니다.", gradeLevel: "middle2" },
    { id: 124, term: "vegetable", partOfSpeech: "명사", meaning: "채소", exampleSentence: "This is a vegetable.", exampleSentenceMeaning: "이것은 채소입니다.", gradeLevel: "middle2" },
    { id: 125, term: "office", partOfSpeech: "명사", meaning: "사무실", exampleSentence: "This is an office.", exampleSentenceMeaning: "이것은 사무실입니다.", gradeLevel: "middle2" },
    { id: 126, term: "machine", partOfSpeech: "명사", meaning: "기계", exampleSentence: "This is a machine.", exampleSentenceMeaning: "이것은 기계입니다.", gradeLevel: "middle2" },
    { id: 127, term: "area", partOfSpeech: "명사", meaning: "지역, 영역", exampleSentence: "This is an area.", exampleSentenceMeaning: "이것은 지역입니다.", gradeLevel: "middle2" },
    { id: 128, term: "piece", partOfSpeech: "명사", meaning: "조각", exampleSentence: "This is a piece.", exampleSentenceMeaning: "이것은 조각입니다.", gradeLevel: "middle2" },
    { id: 129, term: "grace", partOfSpeech: "명사", meaning: "은혜, 은총", exampleSentence: "This is a grace.", exampleSentenceMeaning: "이것은 은혜입니다.", gradeLevel: "middle2" },
    { id: 130, term: "spring", partOfSpeech: "명사", meaning: "봄, 샘물, 튀다", exampleSentence: "This is a spring.", exampleSentenceMeaning: "이것은 봄입니다.", gradeLevel: "middle2" },
    { id: 131, term: "rock", partOfSpeech: "명사", meaning: "바위, 흔들다", exampleSentence: "This is a rock.", exampleSentenceMeaning: "이것은 바위입니다.", gradeLevel: "middle2" },
    { id: 132, term: "line", partOfSpeech: "명사", meaning: "선", exampleSentence: "This is a line.", exampleSentenceMeaning: "이것은 선입니다.", gradeLevel: "middle2" },
    { id: 133, term: "exercise", partOfSpeech: "동사", meaning: "운동하다", exampleSentence: "I like to exercise.", exampleSentenceMeaning: "나는 운동하는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 134, term: "end", partOfSpeech: "명사", meaning: "끝, 목적", exampleSentence: "This is the end.", exampleSentenceMeaning: "이것은 끝입니다.", gradeLevel: "middle2" },
    { id: 135, term: "cook", partOfSpeech: "동사", meaning: "요리하다", exampleSentence: "I like to cook.", exampleSentenceMeaning: "나는 요리하는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 136, term: "fall", partOfSpeech: "동사", meaning: "떨어지다, 가을", exampleSentence: "I like to fall.", exampleSentenceMeaning: "나는 떨어지는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 137, term: "front", partOfSpeech: "명사", meaning: "앞, 전면", exampleSentence: "This is the front.", exampleSentenceMeaning: "이것은 앞입니다.", gradeLevel: "middle2" },
    { id: 138, term: "second", partOfSpeech: "명사", meaning: "두 번째, 초", exampleSentence: "This is a second.", exampleSentenceMeaning: "이것은 두 번째입니다.", gradeLevel: "middle2" },
    { id: 139, term: "cold", partOfSpeech: "형용사", meaning: "추운, 감기", exampleSentence: "It is very cold.", exampleSentenceMeaning: "그것은 매우 추운합니다.", gradeLevel: "middle2" },
    { id: 140, term: "happen", partOfSpeech: "동사", meaning: "일어나다", exampleSentence: "I like to happen.", exampleSentenceMeaning: "나는 일어나는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 141, term: "leave", partOfSpeech: "동사", meaning: "떠나다, 방치하다", exampleSentence: "I like to leave.", exampleSentenceMeaning: "나는 떠나는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 142, term: "remember", partOfSpeech: "동사", meaning: "기억하다", exampleSentence: "I like to remember.", exampleSentenceMeaning: "나는 기억하는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 143, term: "wear", partOfSpeech: "동사", meaning: "입다, 닳다", exampleSentence: "I like to wear.", exampleSentenceMeaning: "나는 입는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 144, term: "move", partOfSpeech: "동사", meaning: "움직이다", exampleSentence: "I like to move.", exampleSentenceMeaning: "나는 움직이는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 145, term: "send", partOfSpeech: "동사", meaning: "보내다", exampleSentence: "I like to send.", exampleSentenceMeaning: "나는 보내는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 146, term: "large", partOfSpeech: "형용사", meaning: "큰, 거대한", exampleSentence: "It is very large.", exampleSentenceMeaning: "그것은 매우 큰합니다.", gradeLevel: "middle2" },
    { id: 147, term: "hot", partOfSpeech: "형용사", meaning: "뜨거운, 매운", exampleSentence: "It is very hot.", exampleSentenceMeaning: "그것은 매우 뜨거운합니다.", gradeLevel: "middle2" },
    { id: 148, term: "early", partOfSpeech: "부사", meaning: "일찍", exampleSentence: "He works early.", exampleSentenceMeaning: "그는 일찍 일해요.", gradeLevel: "middle2" },
    { id: 149, term: "often", partOfSpeech: "부사", meaning: "종종, 자주", exampleSentence: "He works often.", exampleSentenceMeaning: "그는 종종 일해요.", gradeLevel: "middle2" },
    { id: 150, term: "sometimes", partOfSpeech: "부사", meaning: "때때로", exampleSentence: "He works sometimes.", exampleSentenceMeaning: "그는 때때로 일해요.", gradeLevel: "middle2" },
    { id: 151, term: "neighbor", partOfSpeech: "명사", meaning: "이웃, 동네", exampleSentence: "This is a neighbor.", exampleSentenceMeaning: "이것은 이웃입니다.", gradeLevel: "middle2" },
    { id: 152, term: "pet", partOfSpeech: "명사", meaning: "애완동물", exampleSentence: "This is a pet.", exampleSentenceMeaning: "이것은 애완동물입니다.", gradeLevel: "middle2" },
    { id: 153, term: "bottle", partOfSpeech: "명사", meaning: "병", exampleSentence: "This is a bottle.", exampleSentenceMeaning: "이것은 병입니다.", gradeLevel: "middle2" },
    { id: 154, term: "art", partOfSpeech: "명사", meaning: "예술, 기술", exampleSentence: "This is an art.", exampleSentenceMeaning: "이것은 예술입니다.", gradeLevel: "middle2" },
    { id: 155, term: "poem", partOfSpeech: "명사", meaning: "시", exampleSentence: "This is a poem.", exampleSentenceMeaning: "이것은 시입니다.", gradeLevel: "middle2" },
    { id: 156, term: "subject", partOfSpeech: "명사", meaning: "과목, 주제", exampleSentence: "This is a subject.", exampleSentenceMeaning: "이것은 과목입니다.", gradeLevel: "middle2" },
    { id: 157, term: "weekend", partOfSpeech: "명사", meaning: "주말", exampleSentence: "This is a weekend.", exampleSentenceMeaning: "이것은 주말입니다.", gradeLevel: "middle2" },
    { id: 158, term: "price", partOfSpeech: "명사", meaning: "가격", exampleSentence: "This is a price.", exampleSentenceMeaning: "이것은 가격입니다.", gradeLevel: "middle2" },
    { id: 159, term: "custom", partOfSpeech: "명사", meaning: "관습", exampleSentence: "This is a custom.", exampleSentenceMeaning: "이것은 관습입니다.", gradeLevel: "middle2" },
    { id: 160, term: "fact", partOfSpeech: "명사", meaning: "사실", exampleSentence: "This is a fact.", exampleSentenceMeaning: "이것은 사실입니다.", gradeLevel: "middle2" },
    { id: 161, term: "rule", partOfSpeech: "명사", meaning: "규칙, 통치하다", exampleSentence: "This is a rule.", exampleSentenceMeaning: "이것은 규칙입니다.", gradeLevel: "middle2" },
    { id: 162, term: "break", partOfSpeech: "동사", meaning: "깨다, 휴식", exampleSentence: "I like to break.", exampleSentenceMeaning: "나는 깨는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 163, term: "check", partOfSpeech: "동사", meaning: "확인하다", exampleSentence: "I like to check.", exampleSentenceMeaning: "나는 확인하는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 164, term: "stay", partOfSpeech: "동사", meaning: "머물다", exampleSentence: "I like to stay.", exampleSentenceMeaning: "나는 머무는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 165, term: "bring", partOfSpeech: "동사", meaning: "가져오다", exampleSentence: "I like to bring.", exampleSentenceMeaning: "나는 가져오는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 166, term: "build", partOfSpeech: "동사", meaning: "짓다, 축적하다", exampleSentence: "I like to build.", exampleSentenceMeaning: "나는 짓는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 167, term: "join", partOfSpeech: "동사", meaning: "합류하다", exampleSentence: "I like to join.", exampleSentenceMeaning: "나는 합류하는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 168, term: "lose", partOfSpeech: "동사", meaning: "지다, 길을 잃다", exampleSentence: "I like to lose.", exampleSentenceMeaning: "나는 지는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 169, term: "die", partOfSpeech: "동사", meaning: "죽다", exampleSentence: "I like to die.", exampleSentenceMeaning: "나는 죽는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 170, term: "half", partOfSpeech: "명사", meaning: "절반의", exampleSentence: "This is a half.", exampleSentenceMeaning: "이것은 절반의입니다.", gradeLevel: "middle2" },
    { id: 171, term: "few", partOfSpeech: "형용사", meaning: "거의 없는", exampleSentence: "It is very few.", exampleSentenceMeaning: "그것은 매우 거의 없는합니다.", gradeLevel: "middle2" },
    { id: 172, term: "both", partOfSpeech: "형용사", meaning: "둘 다", exampleSentence: "It is very both.", exampleSentenceMeaning: "그것은 매우 둘 다합니다.", gradeLevel: "middle2" },
    { id: 173, term: "sick", partOfSpeech: "형용사", meaning: "아픈", exampleSentence: "It is very sick.", exampleSentenceMeaning: "그것은 매우 아픈합니다.", gradeLevel: "middle2" },
    { id: 174, term: "busy", partOfSpeech: "형용사", meaning: "바쁜", exampleSentence: "It is very busy.", exampleSentenceMeaning: "그것은 매우 바쁜합니다.", gradeLevel: "middle2" },
    { id: 175, term: "real", partOfSpeech: "형용사", meaning: "실제의, 진정한", exampleSentence: "It is very real.", exampleSentenceMeaning: "그것은 매우 실제의합니다.", gradeLevel: "middle2" },
    { id: 176, term: "wrong", partOfSpeech: "형용사", meaning: "잘못된", exampleSentence: "It is very wrong.", exampleSentenceMeaning: "그것은 매우 잘못된합니다.", gradeLevel: "middle2" },
    { id: 177, term: "most", partOfSpeech: "형용사", meaning: "대부분의", exampleSentence: "It is very most.", exampleSentenceMeaning: "그것은 매우 대부분의합니다.", gradeLevel: "middle2" },
    { id: 178, term: "late", partOfSpeech: "형용사", meaning: "늦은", exampleSentence: "It is very late.", exampleSentenceMeaning: "그것은 매우 늦은합니다.", gradeLevel: "middle2" },
    { id: 179, term: "together", partOfSpeech: "부사", meaning: "함께", exampleSentence: "He works together.", exampleSentenceMeaning: "그는 함께 일해요.", gradeLevel: "middle2" },
    { id: 180, term: "even", partOfSpeech: "부사", meaning: "심지어, 평평한", exampleSentence: "He works even.", exampleSentenceMeaning: "그는 심지어 일해요.", gradeLevel: "middle2" },
    { id: 181, term: "health", partOfSpeech: "명사", meaning: "건강", exampleSentence: "This is health.", exampleSentenceMeaning: "이것은 건강입니다.", gradeLevel: "middle2" },
    { id: 182, term: "holiday", partOfSpeech: "명사", meaning: "휴일", exampleSentence: "This is a holiday.", exampleSentenceMeaning: "이것은 휴일입니다.", gradeLevel: "middle2" },
    { id: 183, term: "gift", partOfSpeech: "명사", meaning: "선물, 재능", exampleSentence: "This is a gift.", exampleSentenceMeaning: "이것은 선물입니다.", gradeLevel: "middle2" },
    { id: 184, term: "field", partOfSpeech: "명사", meaning: "분야, 들판", exampleSentence: "This is a field.", exampleSentenceMeaning: "이것은 분야입니다.", gradeLevel: "middle2" },
    { id: 185, term: "site", partOfSpeech: "명사", meaning: "위치, 유적", exampleSentence: "This is a site.", exampleSentenceMeaning: "이것은 위치입니다.", gradeLevel: "middle2" },
    { id: 186, term: "goal", partOfSpeech: "명사", meaning: "목표", exampleSentence: "This is a goal.", exampleSentenceMeaning: "이것은 목표입니다.", gradeLevel: "middle2" },
    { id: 187, term: "effect", partOfSpeech: "명사", meaning: "효과", exampleSentence: "This is an effect.", exampleSentenceMeaning: "이것은 효과입니다.", gradeLevel: "middle2" },
    { id: 188, term: "sign", partOfSpeech: "명사", meaning: "신호, 징조", exampleSentence: "This is a sign.", exampleSentenceMeaning: "이것은 신호입니다.", gradeLevel: "middle2" },
    { id: 189, term: "report", partOfSpeech: "동사", meaning: "보고하다", exampleSentence: "I like to report.", exampleSentenceMeaning: "나는 보고하는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 190, term: "order", partOfSpeech: "명사", meaning: "주문, 명령, 질서", exampleSentence: "This is an order.", exampleSentenceMeaning: "이것은 주문입니다.", gradeLevel: "middle2" },
    { id: 191, term: "experience", partOfSpeech: "동사", meaning: "경험하다", exampleSentence: "I like to experience.", exampleSentenceMeaning: "나는 경험하는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 192, term: "result", partOfSpeech: "명사", meaning: "결과", exampleSentence: "This is a result.", exampleSentenceMeaning: "이것은 결과입니다.", gradeLevel: "middle2" },
    { id: 193, term: "ride", partOfSpeech: "동사", meaning: "타다, 주행하다", exampleSentence: "I like to ride.", exampleSentenceMeaning: "나는 타는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 194, term: "wish", partOfSpeech: "동사", meaning: "소망하다", exampleSentence: "I like to wish.", exampleSentenceMeaning: "나는 소망하는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 195, term: "human", partOfSpeech: "명사", meaning: "인간", exampleSentence: "This is a human.", exampleSentenceMeaning: "이것은 인간입니다.", gradeLevel: "middle2" },
    { id: 196, term: "past", partOfSpeech: "명사", meaning: "과거, 지난", exampleSentence: "This is the past.", exampleSentenceMeaning: "이것은 과거입니다.", gradeLevel: "middle2" },
    { id: 197, term: "carry", partOfSpeech: "동사", meaning: "휴대하다, 옮기다", exampleSentence: "I like to carry.", exampleSentenceMeaning: "나는 휴대하는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 198, term: "draw", partOfSpeech: "동사", meaning: "그리다, 당기다", exampleSentence: "I like to draw.", exampleSentenceMeaning: "나는 그리는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 199, term: "spend", partOfSpeech: "동사", meaning: "쓰다, 보내다", exampleSentence: "I like to spend.", exampleSentenceMeaning: "나는 쓰는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 200, term: "wait", partOfSpeech: "동사", meaning: "기다리다", exampleSentence: "I like to wait.", exampleSentenceMeaning: "나는 기다리는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 201, term: "decide", partOfSpeech: "동사", meaning: "결정하다", exampleSentence: "I like to decide.", exampleSentenceMeaning: "나는 결정하는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 202, term: "choose", partOfSpeech: "동사", meaning: "고르다", exampleSentence: "I like to choose.", exampleSentenceMeaning: "나는 고르는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 203, term: "true", partOfSpeech: "형용사", meaning: "진실한", exampleSentence: "It is very true.", exampleSentenceMeaning: "그것은 매우 진실한합니다.", gradeLevel: "middle2" },
    { id: 204, term: "popular", partOfSpeech: "형용사", meaning: "인기 있는", exampleSentence: "It is very popular.", exampleSentenceMeaning: "그것은 매우 인기 있는합니다.", gradeLevel: "middle2" },
    { id: 205, term: "difficult", partOfSpeech: "형용사", meaning: "어려운", exampleSentence: "It is very difficult.", exampleSentenceMeaning: "그것은 매우 어려운합니다.", gradeLevel: "middle2" },
    { id: 206, term: "foreign", partOfSpeech: "형용사", meaning: "외국의", exampleSentence: "It is very foreign.", exampleSentenceMeaning: "그것은 매우 외국의합니다.", gradeLevel: "middle2" },
    { id: 207, term: "able", partOfSpeech: "형용사", meaning: "능력 있는", exampleSentence: "It is very able.", exampleSentenceMeaning: "그것은 매우 능력 있는합니다.", gradeLevel: "middle2" },
    { id: 208, term: "full", partOfSpeech: "형용사", meaning: "가득 찬", exampleSentence: "It is very full.", exampleSentenceMeaning: "그것은 매우 가득 찬합니다.", gradeLevel: "middle2" },
    { id: 209, term: "usually", partOfSpeech: "부사", meaning: "대게", exampleSentence: "He works usually.", exampleSentenceMeaning: "그는 대게 일해요.", gradeLevel: "middle2" },
    { id: 210, term: "never", partOfSpeech: "부사", meaning: "결코 ~아닌", exampleSentence: "He works never.", exampleSentenceMeaning: "그는 결코 ~아닌 일해요.", gradeLevel: "middle2" },
    { id: 211, term: "brain", partOfSpeech: "명사", meaning: "두뇌", exampleSentence: "This is a brain.", exampleSentenceMeaning: "이것은 두뇌입니다.", gradeLevel: "middle2" },
    { id: 212, term: "voice", partOfSpeech: "명사", meaning: "목소리", exampleSentence: "This is a voice.", exampleSentenceMeaning: "이것은 목소리입니다.", gradeLevel: "middle2" },
    { id: 213, term: "opinion", partOfSpeech: "명사", meaning: "의견", exampleSentence: `This is an opinion.`, exampleSentenceMeaning: "이것은 의견입니다.", gradeLevel: "middle2" },
    { id: 214, term: "age", partOfSpeech: "명사", meaning: "나이, 노화", exampleSentence: "This is an age.", exampleSentenceMeaning: "이것은 나이입니다.", gradeLevel: "middle2" },
    { id: 215, term: "century", partOfSpeech: "명사", meaning: "세기, 100년", exampleSentence: "This is a century.", exampleSentenceMeaning: "이것은 세기입니다.", gradeLevel: "middle2" },
    { id: 216, term: "event", partOfSpeech: "명사", meaning: "사건, 행사", exampleSentence: "This is an event.", exampleSentenceMeaning: "이것은 사건입니다.", gradeLevel: "middle2" },
    { id: 217, term: "dish", partOfSpeech: "명사", meaning: "접시, 요리", exampleSentence: "This is a dish.", exampleSentenceMeaning: "이것은 접시입니다.", gradeLevel: "middle2" },
    { id: 218, term: "toy", partOfSpeech: "명사", meaning: "장난감, 장난치다", exampleSentence: "This is a toy.", exampleSentenceMeaning: "이것은 장난감입니다.", gradeLevel: "middle2" },
    { id: 219, term: "subway", partOfSpeech: "명사", meaning: "지하철", exampleSentence: "This is a subway.", exampleSentenceMeaning: "이것은 지하철입니다.", gradeLevel: "middle2" },
    { id: 220, term: "hundred", partOfSpeech: "명사", meaning: "백(100)", exampleSentence: "This is a hundred.", exampleSentenceMeaning: "이것은 백(100)입니다.", gradeLevel: "middle2" },
    { id: 221, term: "thousand", partOfSpeech: "명사", meaning: "천(1,000)", exampleSentence: "This is a thousand.", exampleSentenceMeaning: "이것은 천(1,000)입니다.", gradeLevel: "middle2" },
    { id: 222, term: "rest", partOfSpeech: "동사", meaning: "쉬다, 나머지", exampleSentence: "I like to rest.", exampleSentenceMeaning: "나는 쉬는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 223, term: "waste", partOfSpeech: "동사", meaning: "낭비하다, 쓰레기", exampleSentence: "I like to waste.", exampleSentenceMeaning: "나는 낭비하는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 224, term: "surprise", partOfSpeech: "동사", meaning: "놀라게 하다", exampleSentence: "I like to surprise.", exampleSentenceMeaning: "나는 놀라게 하는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 225, term: "bear", partOfSpeech: "동사", meaning: "견디다, 낳다", exampleSentence: "I like to bear.", exampleSentenceMeaning: "나는 견디는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 226, term: "fight", partOfSpeech: "동사", meaning: "싸우다", exampleSentence: "I like to fight.", exampleSentenceMeaning: "나는 싸우는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 227, term: "buy", partOfSpeech: "동사", meaning: "사다, 구매하다", exampleSentence: "I like to buy.", exampleSentenceMeaning: "나는 사는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 228, term: "sell", partOfSpeech: "동사", meaning: "팔다, 팔리다", exampleSentence: "I like to sell.", exampleSentenceMeaning: "나는 파는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 229, term: "follow", partOfSpeech: "동사", meaning: "따르다, 추적하다", exampleSentence: "I like to follow.", exampleSentenceMeaning: "나는 따르는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 230, term: "miss", partOfSpeech: "동사", meaning: "놓치다, 그리워하다", exampleSentence: "I like to miss.", exampleSentenceMeaning: "나는 놓치는 것을 좋아해요.", gradeLevel: "middle2" },
    { id: 231, term: "close", partOfSpeech: "형용사", meaning: "가까운, 닫다", exampleSentence: "It is very close.", exampleSentenceMeaning: "그것은 매우 가까운합니다.", gradeLevel: "middle2" },
    { id: 232, term: "free", partOfSpeech: "형용사", meaning: "자유로운, 무료의", exampleSentence: "It is very free.", exampleSentenceMeaning: "그것은 매우 자유로운합니다.", gradeLevel: "middle2" },
    { id: 233, term: "upset", partOfSpeech: "형용사", meaning: "언짢은", exampleSentence: "It is very upset.", exampleSentenceMeaning: "그것은 매우 언짢은합니다.", gradeLevel: "middle2" },
    { id: 234, term: "healthy", partOfSpeech: "형용사", meaning: "건강한", exampleSentence: "It is very healthy.", exampleSentenceMeaning: "그것은 매우 건강한합니다.", gradeLevel: "middle2" },
    { id: 235, term: "delicious", partOfSpeech: "형용사", meaning: "맛있는", exampleSentence: "It is very delicious.", exampleSentenceMeaning: "그것은 매우 맛있는합니다.", gradeLevel: "middle2" },
    { id: 236, term: "sad", partOfSpeech: "형용사", meaning: "슬픈", exampleSentence: "It is very sad.", exampleSentenceMeaning: "그것은 매우 슬픈합니다.", gradeLevel: "middle2" },
    { id: 237, term: "careful", partOfSpeech: "형용사", meaning: "주의 깊은", exampleSentence: "It is very careful.", exampleSentenceMeaning: "그것은 매우 주의 깊은합니다.", gradeLevel: "middle2" },
    { id: 238, term: "ready", partOfSpeech: "형용사", meaning: "준비 된", exampleSentence: "It is very ready.", exampleSentenceMeaning: "그것은 매우 준비 된합니다.", gradeLevel: "middle2" },
    { id: 239, term: "away", partOfSpeech: "부사", meaning: "멀리, 떨어진", exampleSentence: "He works away.", exampleSentenceMeaning: "그는 멀리 일해요.", gradeLevel: "middle2" },
    { id: 240, term: "however", partOfSpeech: "부사", meaning: "하지만", exampleSentence: "He works however.", exampleSentenceMeaning: "그는 하지만 일해요.", gradeLevel: "middle2" },
    { id: 241, term: "president", partOfSpeech: "명사", meaning: "대통령", exampleSentence: "This is a president.", exampleSentenceMeaning: "이것은 대통령입니다.", gradeLevel: "middle3" },
    { id: 242, term: "diary", partOfSpeech: "명사", meaning: "일기", exampleSentence: "This is a diary.", exampleSentenceMeaning: "이것은 일기입니다.", gradeLevel: "middle3" },
    { id: 243, term: "cartoon", partOfSpeech: "명사", meaning: "만화", exampleSentence: "This is a cartoon.", exampleSentenceMeaning: "이것은 만화입니다.", gradeLevel: "middle3" },
    { id: 244, term: "meal", partOfSpeech: "명사", meaning: "식사", exampleSentence: "This is a meal.", exampleSentenceMeaning: "이것은 식사입니다.", gradeLevel: "middle3" },
    { id: 245, term: "character", partOfSpeech: "명사", meaning: "문자, 성격", exampleSentence: "This is a character.", exampleSentenceMeaning: "이것은 문자입니다.", gradeLevel: "middle3" },
    { id: 246, term: "reason", partOfSpeech: "명사", meaning: "이유", exampleSentence: "This is a reason.", exampleSentenceMeaning: "이것은 이유입니다.", gradeLevel: "middle3" },
    { id: 247, term: "ground", partOfSpeech: "명사", meaning: "지면, 기반", exampleSentence: "This is a ground.", exampleSentenceMeaning: "이것은 지면입니다.", gradeLevel: "middle3" },
    { id: 248, term: "community", partOfSpeech: "명사", meaning: "공동체", exampleSentence: "This is a community.", exampleSentenceMeaning: "이것은 공동체입니다.", gradeLevel: "middle3" },
    { id: 249, term: "glass", partOfSpeech: "명사", meaning: "유리", exampleSentence: "This is a glass.", exampleSentenceMeaning: "이것은 유리입니다.", gradeLevel: "middle3" },
    { id: 250, term: "weight", partOfSpeech: "명사", meaning: "무게", exampleSentence: "This is a weight.", exampleSentenceMeaning: "이것은 무게입니다.", gradeLevel: "middle3" },
    { id: 251, term: "control", partOfSpeech: "동사", meaning: "통제하다", exampleSentence: "I like to control.", exampleSentenceMeaning: "나는 통제하는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 252, term: "step", partOfSpeech: "명사", meaning: "단계", exampleSentence: "This is a step.", exampleSentenceMeaning: "이것은 단계입니다.", gradeLevel: "middle3" },
    { id: 253, term: "matter", partOfSpeech: "동사", meaning: "문제, 중요하다", exampleSentence: "I like to matter.", exampleSentenceMeaning: "나는 문제는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 254, term: "match", partOfSpeech: "동사", meaning: "어울리다, 필적하다", exampleSentence: "I like to match.", exampleSentenceMeaning: "나는 어울리는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 255, term: "set", partOfSpeech: "동사", meaning: "설치하다, 정하다", exampleSentence: "I like to set.", exampleSentenceMeaning: "나는 설치하는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 256, term: "catch", partOfSpeech: "동사", meaning: "잡다", exampleSentence: "I like to catch.", exampleSentenceMeaning: "나는 잡는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 257, term: "hold", partOfSpeech: "동사", meaning: "유지하다, 껴안다", exampleSentence: "I like to hold.", exampleSentenceMeaning: "나는 유지하는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 258, term: "pick", partOfSpeech: "동사", meaning: "줍다, 고르다", exampleSentence: "I like to pick.", exampleSentenceMeaning: "나는 줍는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 259, term: "teach", partOfSpeech: "동사", meaning: "가르치다", exampleSentence: "I like to teach.", exampleSentenceMeaning: "나는 가르치는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 260, term: "agree", partOfSpeech: "동사", meaning: "동의하다", exampleSentence: "I like to agree.", exampleSentenceMeaning: "나는 동의하는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 261, term: "invent", partOfSpeech: "동사", meaning: "발명하다", exampleSentence: "I like to invent.", exampleSentenceMeaning: "나는 발명하는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 262, term: "welcome", partOfSpeech: "동사", meaning: "환영하다", exampleSentence: "I like to welcome.", exampleSentenceMeaning: "나는 환영하는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 263, term: "bright", partOfSpeech: "형용사", meaning: "밝은", exampleSentence: "It is very bright.", exampleSentenceMeaning: "그것은 매우 밝은합니다.", gradeLevel: "middle3" },
    { id: 264, term: "smart", partOfSpeech: "형용사", meaning: "영리한", exampleSentence: "It is very smart.", exampleSentenceMeaning: "그것은 매우 영리한합니다.", gradeLevel: "middle3" },
    { id: 265, term: "wise", partOfSpeech: "형용사", meaning: "현명한", exampleSentence: "It is very wise.", exampleSentenceMeaning: "그것은 매우 현명한합니다.", gradeLevel: "middle3" },
    { id: 266, term: "hungry", partOfSpeech: "형용사", meaning: "배고픈", exampleSentence: "It is very hungry.", exampleSentenceMeaning: "그것은 매우 배고픈합니다.", gradeLevel: "middle3" },
    { id: 267, term: "fine", partOfSpeech: "형용사", meaning: "훌륭한, 벌금", exampleSentence: "It is very fine.", exampleSentenceMeaning: "그것은 매우 훌륭한합니다.", gradeLevel: "middle3" },
    { id: 268, term: "pretty", partOfSpeech: "형용사", meaning: "예쁜, 매우", exampleSentence: "It is very pretty.", exampleSentenceMeaning: "그것은 매우 예쁜합니다.", gradeLevel: "middle3" },
    { id: 269, term: "still", partOfSpeech: "부사", meaning: "여전히, 정지한", exampleSentence: "He works still.", exampleSentenceMeaning: "그는 여전히 일해요.", gradeLevel: "middle3" },
    { id: 270, term: "later", partOfSpeech: "부사", meaning: "나중에", exampleSentence: "He works later.", exampleSentenceMeaning: "그는 나중에 일해요.", gradeLevel: "middle3" },
    { id: 271, term: "teenager", partOfSpeech: "명사", meaning: "십대", exampleSentence: "This is a teenager.", exampleSentenceMeaning: "이것은 십대입니다.", gradeLevel: "middle3" },
    { id: 272, term: "arm", partOfSpeech: "명사", meaning: "팔, 무기, 무장하다", exampleSentence: "This is an arm.", exampleSentenceMeaning: "이것은 팔입니다.", gradeLevel: "middle3" },
    { id: 273, term: "skill", partOfSpeech: "명사", meaning: "기술", exampleSentence: "This is a skill.", exampleSentenceMeaning: "이것은 기술입니다.", gradeLevel: "middle3" },
    { id: 274, term: "factory", partOfSpeech: "명사", meaning: "공장", exampleSentence: "This is a factory.", exampleSentenceMeaning: "이것은 공장입니다.", gradeLevel: "middle3" },
    { id: 275, term: "prize", partOfSpeech: "명사", meaning: "상, 상을 주다", exampleSentence: "This is a prize.", exampleSentenceMeaning: "이것은 상입니다.", gradeLevel: "middle3" },
    { id: 276, term: "chance", partOfSpeech: "명사", meaning: "기회, 가능성", exampleSentence: "This is a chance.", exampleSentenceMeaning: "이것은 기회입니다.", gradeLevel: "middle3" },
    { id: 277, term: "shape", partOfSpeech: "명사", meaning: "모양, 형태", exampleSentence: "This is a shape.", exampleSentenceMeaning: "이것은 모양입니다.", gradeLevel: "middle3" },
    { id: 278, term: "difference", partOfSpeech: "명사", meaning: "차이, 차별", exampleSentence: "This is a difference.", exampleSentenceMeaning: "이것은 차이입니다.", gradeLevel: "middle3" },
    { id: 279, term: "wall", partOfSpeech: "명사", meaning: "벽", exampleSentence: "This is a wall.", exampleSentenceMeaning: "이것은 벽입니다.", gradeLevel: "middle3" },
    { id: 280, term: "contest", partOfSpeech: "명사", meaning: "경연", exampleSentence: "This is a contest.", exampleSentenceMeaning: "이것은 경연입니다.", gradeLevel: "middle3" },
    { id: 281, term: "race", partOfSpeech: "명사", meaning: "경주, 인종", exampleSentence: "This is a race.", exampleSentenceMeaning: "이것은 경주입니다.", gradeLevel: "middle3" },
    { id: 282, term: "smell", partOfSpeech: "동사", meaning: "냄새가 나다", exampleSentence: "I like to smell.", exampleSentenceMeaning: "나는 냄새가 나는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 283, term: "interest", partOfSpeech: "동사", meaning: "흥미롭게 하다", exampleSentence: "I like to interest.", exampleSentenceMeaning: "나는 흥미롭게 하는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 284, term: "judge", partOfSpeech: "동사", meaning: "판단하다", exampleSentence: "I like to judge.", exampleSentenceMeaning: "나는 판단하는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 285, term: "cause", partOfSpeech: "동사", meaning: "원인, 유발하다", exampleSentence: "I like to cause.", exampleSentenceMeaning: "나는 원인는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 286, term: "cover", partOfSpeech: "동사", meaning: "덮다, 다루다", exampleSentence: "I like to cover.", exampleSentenceMeaning: "나는 덮는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 287, term: "travel", partOfSpeech: "동사", meaning: "여행하다, 이동하다", exampleSentence: "I like to travel.", exampleSentenceMeaning: "나는 여행하는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 288, term: "guess", partOfSpeech: "동사", meaning: "추측하다", exampleSentence: "I like to guess.", exampleSentenceMeaning: "나는 추측하는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 289, term: "finish", partOfSpeech: "동사", meaning: "끝마치다", exampleSentence: "I like to finish.", exampleSentenceMeaning: "나는 끝마치는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 290, term: "wash", partOfSpeech: "동사", meaning: "닦다", exampleSentence: "I like to wash.", exampleSentenceMeaning: "나는 닦는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 291, term: "introduce", partOfSpeech: "동사", meaning: "소개하다, 도입하다", exampleSentence: "I like to introduce.", exampleSentenceMeaning: "나는 소개하는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 292, term: "hurt", partOfSpeech: "동사", meaning: "상처를 주다(받다)", exampleSentence: "I like to hurt.", exampleSentenceMeaning: "나는 상처를 주다(받다)는 것을 좋아해요.", gradeLevel: "middle3" },
    { id: 293, term: "tired", partOfSpeech: "형용사", meaning: "피곤한", exampleSentence: "It is very tired.", exampleSentenceMeaning: "그것은 매우 피곤한합니다.", gradeLevel: "middle3" },
    { id: 294, term: "proud", partOfSpeech: "형용사", meaning: "거만한, 당당한", exampleSentence: "It is very proud.", exampleSentenceMeaning: "그것은 매우 거만한합니다.", gradeLevel: "middle3" },
    { id: 295, term: "dirty", partOfSpeech: "형용사", meaning: "더러운", exampleSentence: "It is very dirty.", exampleSentenceMeaning: "그것은 매우 더러운합니다.", gradeLevel: "middle3" },
    { id: 296, term: "angry", partOfSpeech: "형용사", meaning: "화난", exampleSentence: "It is very angry.", exampleSentenceMeaning: "그것은 매우 화난합니다.", gradeLevel: "middle3" },
    { id: 297, term: "modern", partOfSpeech: "형용사", meaning: "현대의", exampleSentence: "It is very modern.", exampleSentenceMeaning: "그것은 매우 현대의합니다.", gradeLevel: "middle3" },
    { id: 298, term: "useful", partOfSpeech: "형용사", meaning: "유용한", exampleSentence: "It is very useful.", exampleSentenceMeaning: "그것은 매우 유용한합니다.", gradeLevel: "middle3" },
    { id: 299, term: "soon", partOfSpeech: "부사", meaning: "곧", exampleSentence: "He works soon.", exampleSentenceMeaning: "그는 곧 일해요.", gradeLevel: "middle3" },
    { id: 300, term: "once", partOfSpeech: "부사", meaning: "한때, 일단 ~하면", exampleSentence: "He works once.", exampleSentenceMeaning: "그는 한때 일해요.", gradeLevel: "middle3" },
    { id: 301, term: "kind", partOfSpeech: "형용사", meaning: "친절한", exampleSentence: "She is very kind.", exampleSentenceMeaning: "그녀는 매우 친절합니다.", gradeLevel: "middle1" },
    { id: 302, term: "clever", partOfSpeech: "형용사", meaning: "영리한", exampleSentence: "He is a clever student.", exampleSentenceMeaning: "그는 영리한 학생입니다.", gradeLevel: "middle1" },
    { id: 303, term: "wise", partOfSpeech: "형용사", meaning: "지혜로운", exampleSentence: "My grandfather is very wise.", exampleSentenceMeaning: "저의 할아버지는 매우 지혜로우십니다.", gradeLevel: "middle1" },
    { id: 304, term: "foolish", partOfSpeech: "형용사", meaning: "바보 같은", exampleSentence: "That was a foolish mistake.", exampleSentenceMeaning: "그것은 바보 같은 실수였습니다.", gradeLevel: "middle1" },
    { id: 305, term: "proud", partOfSpeech: "형용사", meaning: "자랑스러워하는", exampleSentence: "She is proud of her work.", exampleSentenceMeaning: "그녀는 자신의 일을 자랑스러워합니다.", gradeLevel: "middle1" },
    { id: 306, term: "honest", partOfSpeech: "형용사", meaning: "정직한", exampleSentence: "He is an honest man.", exampleSentenceMeaning: "그는 정직한 사람입니다.", gradeLevel: "middle1" },
    { id: 307, term: "gentle", partOfSpeech: "형용사", meaning: "부드러운", exampleSentence: "He has a gentle voice.", exampleSentenceMeaning: "그는 부드러운 목소리를 가지고 있습니다.", gradeLevel: "middle1" },
    { id: 308, term: "careful", partOfSpeech: "형용사", meaning: "조심성 있는", exampleSentence: "Please be careful.", exampleSentenceMeaning: "조심하세요.", gradeLevel: "middle1" },
    { id: 309, term: "brave", partOfSpeech: "형용사", meaning: "용감한", exampleSentence: "The firefighter was very brave.", exampleSentenceMeaning: "그 소방관은 매우 용감했습니다.", gradeLevel: "middle1" },
    { id: 310, term: "lazy", partOfSpeech: "형용사", meaning: "게으른", exampleSentence: "He is a lazy cat.", exampleSentenceMeaning: "그는 게으른 고양이입니다.", gradeLevel: "middle1" },
    { id: 311, term: "funny", partOfSpeech: "형용사", meaning: "웃기는", exampleSentence: "That joke was very funny.", exampleSentenceMeaning: "그 농담은 매우 웃겼습니다.", gradeLevel: "middle1" },
    { id: 312, term: "calm", partOfSpeech: "형용사", meaning: "차분한", exampleSentence: "Stay calm and don't panic.", exampleSentenceMeaning: "차분함을 유지하고 당황하지 마세요.", gradeLevel: "middle1" },
    { id: 313, term: "character", partOfSpeech: "명사", meaning: "성격", exampleSentence: "She has a strong character.", exampleSentenceMeaning: "그녀는 강한 성격을 가지고 있습니다.", gradeLevel: "middle1" },
    { id: 314, term: "serious", partOfSpeech: "형용사", meaning: "진지한", exampleSentence: "This is a serious matter.", exampleSentenceMeaning: "이것은 진지한 문제입니다.", gradeLevel: "middle1" },
    { id: 315, term: "strict", partOfSpeech: "형용사", meaning: "엄격한", exampleSentence: "My teacher is very strict.", exampleSentenceMeaning: "우리 선생님은 매우 엄격하십니다.", gradeLevel: "middle1" },
    { id: 316, term: "cruel", partOfSpeech: "형용사", meaning: "잔인한", exampleSentence: "It was a cruel thing to do.", exampleSentenceMeaning: "그것은 잔인한 행동이었습니다.", gradeLevel: "middle1" },
    { id: 317, term: "mean", partOfSpeech: "형용사", meaning: "야비한", exampleSentence: "Don't be mean to your brother.", exampleSentenceMeaning: "남동생에게 야비하게 굴지 마세요.", gradeLevel: "middle1" },
    { id: 318, term: "selfish", partOfSpeech: "형용사", meaning: "이기적인", exampleSentence: "He is a selfish person.", exampleSentenceMeaning: "그는 이기적인 사람입니다.", gradeLevel: "middle1" },
    { id: 319, term: "evil", partOfSpeech: "형용사", meaning: "나쁜", exampleSentence: "That was an evil plan.", exampleSentenceMeaning: "그것은 나쁜 계획이었습니다.", gradeLevel: "middle1" },
    { id: 320, term: "curious", partOfSpeech: "형용사", meaning: "호기심이 많은", exampleSentence: "Cats are very curious animals.", exampleSentenceMeaning: "고양이는 매우 호기심이 많은 동물입니다.", gradeLevel: "middle1" },
    { id: 321, term: "cheerful", partOfSpeech: "형용사", meaning: "쾌활한", exampleSentence: "She has a cheerful personality.", exampleSentenceMeaning: "그녀는 쾌활한 성격을 가지고 있습니다.", gradeLevel: "middle1" },
    { id: 322, term: "friendly", partOfSpeech: "형용사", meaning: "친한/다정한", exampleSentence: "My dog is very friendly.", exampleSentenceMeaning: "우리 강아지는 매우 다정합니다.", gradeLevel: "middle1" },
    { id: 323, term: "modest", partOfSpeech: "형용사", meaning: "겸손한", exampleSentence: "He is a modest and humble person.", exampleSentenceMeaning: "그는 겸손하고 겸허한 사람입니다.", gradeLevel: "middle1" },
    { id: 324, term: "generous", partOfSpeech: "형용사", meaning: "관대한/인심이 후한", exampleSentence: "Thank you for your generous donation.", exampleSentenceMeaning: "관대한 기부에 감사드립니다.", gradeLevel: "middle1" },
    { id: 325, term: "sensitive", partOfSpeech: "형용사", meaning: "민감한", exampleSentence: "She is sensitive to criticism.", exampleSentenceMeaning: "그녀는 비판에 민감합니다.", gradeLevel: "middle1" },
    { id: 326, term: "confident", partOfSpeech: "형용사", meaning: "자신만만한", exampleSentence: "He feels confident about the exam.", exampleSentenceMeaning: "그는 시험에 대해 자신감이 있습니다.", gradeLevel: "middle1" },
    { id: 327, term: "positive", partOfSpeech: "형용사", meaning: "긍정적인", exampleSentence: "Try to have a positive attitude.", exampleSentenceMeaning: "긍정적인 태도를 가지도록 노력하세요.", gradeLevel: "middle1" },
    { id: 328, term: "negative", partOfSpeech: "형용사", meaning: "부정적인", exampleSentence: "Don't focus on negative thoughts.", exampleSentenceMeaning: "부정적인 생각에 집중하지 마세요.", gradeLevel: "middle1" },
    { id: 329, term: "optimistic", partOfSpeech: "형용사", meaning: "낙관적인", exampleSentence: "She is optimistic about the future.", exampleSentenceMeaning: "그녀는 미래에 대해 낙관적입니다.", gradeLevel: "middle1" },
    { id: 330, term: "cautious", partOfSpeech: "형용사", meaning: "조심스러운", exampleSentence: "Be cautious when crossing the street.", exampleSentenceMeaning: "길을 건널 때 조심하세요.", gradeLevel: "middle1" },
    { id: 331, term: "big", partOfSpeech: "형용사", meaning: "큰", exampleSentence: "That is a big house.", exampleSentenceMeaning: "저것은 큰 집입니다.", gradeLevel: "middle1" },
    { id: 332, term: "old", partOfSpeech: "형용사", meaning: "나이가 많은", exampleSentence: "He is an old man.", exampleSentenceMeaning: "그는 나이가 많은 남자입니다.", gradeLevel: "middle1" },
    { id: 333, term: "tall", partOfSpeech: "형용사", meaning: "키가 큰", exampleSentence: "She is very tall.", exampleSentenceMeaning: "그녀는 키가 매우 큽니다.", gradeLevel: "middle1" },
    { id: 334, term: "cute", partOfSpeech: "형용사", meaning: "귀여운", exampleSentence: "The puppy is very cute.", exampleSentenceMeaning: "그 강아지는 매우 귀엽습니다.", gradeLevel: "middle1" },
    { id: 335, term: "pretty", partOfSpeech: "형용사", meaning: "예쁜/매우", exampleSentence: "The flowers are very pretty.", exampleSentenceMeaning: "꽃들이 매우 예쁩니다.", gradeLevel: "middle1" },
    { id: 336, term: "beautiful", partOfSpeech: "형용사", meaning: "아름다운", exampleSentence: "The sunset was beautiful.", exampleSentenceMeaning: "석양은 아름다웠습니다.", gradeLevel: "middle1" },
    { id: 337, term: "ugly", partOfSpeech: "형용사", meaning: "못생긴", exampleSentence: "It is an ugly sweater.", exampleSentenceMeaning: "그것은 못생긴 스웨터입니다.", gradeLevel: "middle1" },
    { id: 338, term: "fat", partOfSpeech: "형용사", meaning: "뚱뚱한", exampleSentence: "My cat is a little fat.", exampleSentenceMeaning: "우리 고양이는 약간 뚱뚱합니다.", gradeLevel: "middle1" },
    { id: 339, term: "overweight", partOfSpeech: "형용사", meaning: "과체중의", exampleSentence: "He is slightly overweight.", exampleSentenceMeaning: "그는 약간 과체중입니다.", gradeLevel: "middle1" },
    { id: 340, term: "young", partOfSpeech: "형용사", meaning: "어린", exampleSentence: "She is too young to drive.", exampleSentenceMeaning: "그녀는 운전하기에는 너무 어립니다.", gradeLevel: "middle1" },
    { id: 341, term: "handsome", partOfSpeech: "형용사", meaning: "잘생긴", exampleSentence: "He is a handsome actor.", exampleSentenceMeaning: "그는 잘생긴 배우입니다.", gradeLevel: "middle1" },
    { id: 342, term: "slim", partOfSpeech: "형용사", meaning: "날씬한", exampleSentence: "She wants to be slim.", exampleSentenceMeaning: "그녀는 날씬해지고 싶어합니다.", gradeLevel: "middle1" },
    { id: 343, term: "beard", partOfSpeech: "명사", meaning: "턱수염", exampleSentence: "He has a long beard.", exampleSentenceMeaning: "그는 긴 턱수염을 가지고 있습니다.", gradeLevel: "middle1" },
    { id: 344, term: "plain", partOfSpeech: "형용사", meaning: "평범하게 생긴", exampleSentence: "She wore a plain dress.", exampleSentenceMeaning: "그녀는 평범한 드레스를 입었습니다.", gradeLevel: "middle1" },
    { id: 345, term: "good-looking", partOfSpeech: "형용사", meaning: "잘생긴", exampleSentence: "He is a good-looking man.", exampleSentenceMeaning: "그는 잘생긴 남자입니다.", gradeLevel: "middle1" },
    { id: 346, term: "skinny", partOfSpeech: "형용사", meaning: "깡마른", exampleSentence: "The model was very skinny.", exampleSentenceMeaning: "그 모델은 매우 깡말랐습니다.", gradeLevel: "middle1" },
    { id: 347, term: "fit", partOfSpeech: "형용사", meaning: "건강한/꼭 맞다", exampleSentence: "He stays fit by exercising.", exampleSentenceMeaning: "그는 운동으로 건강을 유지합니다.", gradeLevel: "middle1" },
    { id: 348, term: "muscular", partOfSpeech: "형용사", meaning: "근육질의", exampleSentence: "The athlete is very muscular.", exampleSentenceMeaning: "그 운동선수는 매우 근육질입니다.", gradeLevel: "middle1" },
    { id: 349, term: "thin", partOfSpeech: "형용사", meaning: "가는/숱이 적은", exampleSentence: "The book is very thin.", exampleSentenceMeaning: "그 책은 매우 얇습니다.", gradeLevel: "middle1" },
    { id: 350, term: "bald", partOfSpeech: "형용사", meaning: "대머리의", exampleSentence: "He started to go bald in his thirties.", exampleSentenceMeaning: "그는 30대에 대머리가 되기 시작했습니다.", gradeLevel: "middle1" },
    { id: 351, term: "curly", partOfSpeech: "형용사", meaning: "곱슬거리는", exampleSentence: "She has curly hair.", exampleSentenceMeaning: "그녀는 곱슬머리입니다.", gradeLevel: "middle1" },
    { id: 352, term: "dye", partOfSpeech: "동사", meaning: "염색하다", exampleSentence: "I want to dye my hair.", exampleSentenceMeaning: "나는 머리를 염색하고 싶어요.", gradeLevel: "middle1" },
    { id: 353, term: "appearance", partOfSpeech: "명사", meaning: "외모", exampleSentence: "His appearance changed a lot.", exampleSentenceMeaning: "그의 외모가 많이 변했습니다.", gradeLevel: "middle1" },
    { id: 354, term: "attractive", partOfSpeech: "형용사", meaning: "매력적인", exampleSentence: "She has an attractive smile.", exampleSentenceMeaning: "그녀는 매력적인 미소를 가지고 있습니다.", gradeLevel: "middle1" },
    { id: 355, term: "charming", partOfSpeech: "형용사", meaning: "멋진/매력적인", exampleSentence: "He is a charming prince.", exampleSentenceMeaning: "그는 멋진 왕자입니다.", gradeLevel: "middle1" },
    { id: 356, term: "mustache", partOfSpeech: "명사", meaning: "코밑수염", exampleSentence: "He grew a mustache.", exampleSentenceMeaning: "그는 코밑수염을 길렀습니다.", gradeLevel: "middle1" },
    { id: 357, term: "sideburns", partOfSpeech: "명사", meaning: "구레나룻", exampleSentence: "He shaved off his sideburns.", exampleSentenceMeaning: "그는 구레나룻을 밀었습니다.", gradeLevel: "middle1" },
    { id: 358, term: "middle-aged", partOfSpeech: "형용사", meaning: "중년의", exampleSentence: "She is a middle-aged woman.", exampleSentenceMeaning: "그녀는 중년 여성입니다.", gradeLevel: "middle1" },
    { id: 359, term: "build", partOfSpeech: "명사", meaning: "체격", exampleSentence: "He has a strong build.", exampleSentenceMeaning: "그는 체격이 좋습니다.", gradeLevel: "middle1" },
    { id: 360, term: "image", partOfSpeech: "명사", meaning: "이미지", exampleSentence: "The company has a good image.", exampleSentenceMeaning: "그 회사는 좋은 이미지를 가지고 있습니다.", gradeLevel: "middle1" },
    { id: 361, term: "smile", partOfSpeech: "명사", meaning: "미소", exampleSentence: "She has a beautiful smile.", exampleSentenceMeaning: "그녀는 아름다운 미소를 가지고 있습니다.", gradeLevel: "middle1" },
    { id: 362, term: "enjoy", partOfSpeech: "동사", meaning: "즐기다", exampleSentence: "I enjoy reading books.", exampleSentenceMeaning: "나는 책 읽는 것을 즐겨요.", gradeLevel: "middle1" },
    { id: 363, term: "cry", partOfSpeech: "동사", meaning: "울다", exampleSentence: "The baby started to cry.", exampleSentenceMeaning: "아기가 울기 시작했어요.", gradeLevel: "middle1" },
    { id: 364, term: "tear", partOfSpeech: "명사", meaning: "눈물", exampleSentence: "A tear rolled down her cheek.", exampleSentenceMeaning: "눈물이 그녀의 뺨을 타고 흘러내렸습니다.", gradeLevel: "middle1" },
    { id: 365, term: "glad", partOfSpeech: "형용사", meaning: "기쁜", exampleSentence: "I am glad to see you.", exampleSentenceMeaning: "만나서 기쁩니다.", gradeLevel: "middle1" },
    { id: 366, term: "angry", partOfSpeech: "형용사", meaning: "화가 난", exampleSentence: "He was angry with me.", exampleSentenceMeaning: "그는 나에게 화가 났습니다.", gradeLevel: "middle1" },
    { id: 367, term: "fear", partOfSpeech: "명사", meaning: "공포", exampleSentence: "She has a fear of heights.", exampleSentenceMeaning: "그녀는 높은 곳에 대한 공포가 있습니다.", gradeLevel: "middle1" },
    { id: 368, term: "joy", partOfSpeech: "명사", meaning: "기쁨", exampleSentence: "Her heart was filled with joy.", exampleSentenceMeaning: "그녀의 마음은 기쁨으로 가득 찼습니다.", gradeLevel: "middle1" },
    { id: 369, term: "miss", partOfSpeech: "동사", meaning: "그리워하다", exampleSentence: "I miss my family.", exampleSentenceMeaning: "나는 가족이 그리워요.", gradeLevel: "middle1" }
];


// --- Helper Functions ---
const shuffleArray = <T,>(array: T[]): T[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};

const speak = (text: string, lang = 'en-US') => {
    if (typeof text !== 'string' || !text.trim()) {
        console.warn("Speak function called with invalid/empty text:", text);
        return;
    }
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel(); 
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        const findAndSpeak = () => {
            const englishVoice = speechSynthesis.getVoices().find(voice => voice.lang === lang && (voice.name.includes('Google') || voice.name.includes('Microsoft David') || voice.name.includes('Samantha') || voice.default));
            if (englishVoice) {
                utterance.voice = englishVoice;
            }
            speechSynthesis.speak(utterance);
        };

        if (speechSynthesis.getVoices().length > 0) {
            findAndSpeak();
        } else {
            speechSynthesis.onvoiceschanged = findAndSpeak;
        }
    } else {
        console.warn("Speech synthesis not supported in this browser.");
    }
};

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const getDefaultWordStat = (wordId: string | number): WordStat => ({
    id: wordId,
    isMastered: false,
    lastReviewed: null,
    quizIncorrectCount: 0,
});


// --- API Client Setup (Gemini) ---
let ai: GoogleGenAI | null = null;
if (process.env.API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
} else {
    console.warn("API_KEY environment variable not set. AI features will be disabled.");
}

// --- Gemini API Quota Management ---
let isCurrentlyGeminiQuotaExhausted = false;
let quotaCooldownTimeoutId: number | null = null;
const GEMINI_QUOTA_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

const setGeminiQuotaExhaustedCooldown = (
    addToastForNotification: (message: string, type: ToastMessage['type']) => void,
    featureName?: string // e.g., "단어 정보 조회", "AI 예문 생성", "텍스트 요약"
) => {
    if (!isCurrentlyGeminiQuotaExhausted) {
        const cooldownMinutes = GEMINI_QUOTA_COOLDOWN_MS / 60000;
        console.log(`Gemini API quota exhaustion detected for '${featureName || 'a Gemini API call'}'. Activating ${cooldownMinutes}-minute cooldown.`);
        isCurrentlyGeminiQuotaExhausted = true;
        
        const baseMessage = featureName
            ? `Gemini API 사용량 할당량(quota)을 초과하여 '${featureName}' 기능 사용이 중단됩니다.`
            : `Gemini API 사용량 할당량(quota)을 초과했습니다.`;
        
        addToastForNotification(`${baseMessage} Google AI Studio 또는 Google Cloud Console에서 할당량 및 결제 세부 정보를 확인해주세요. 추가 API 호출이 ${cooldownMinutes}분 동안 중단됩니다.`, "error");
        
        if (quotaCooldownTimeoutId) {
            clearTimeout(quotaCooldownTimeoutId);
        }
        quotaCooldownTimeoutId = window.setTimeout(() => {
            isCurrentlyGeminiQuotaExhausted = false;
            quotaCooldownTimeoutId = null;
            console.log("Gemini API quota cooldown finished. API calls may resume.");
            addToastForNotification(`Gemini API 호출 제한 시간이 종료되었습니다. ${featureName ? `'${featureName}' 기능을 ` : ''}다시 시도할 수 있습니다.`, "info");
        }, GEMINI_QUOTA_COOLDOWN_MS);
    }
};


const generateWordDetailsWithGemini = async (term: string, addToast: (message: string, type: ToastMessage['type']) => void, setGlobalLoading: (loading: boolean) => void, retries = 2, initialDelay = 7000): Promise<Partial<Word> | null> => {
    if (!ai) {
        addToast("AI 기능을 사용하려면 API 키가 필요합니다. 환경 변수를 확인해주세요.", "warning");
        return null;
    }
    if (isCurrentlyGeminiQuotaExhausted) {
        addToast(`Gemini API 할당량이 이전에 감지되어 현재 API 호출이 중단된 상태입니다. '${term}'에 대한 정보 가져오기를 건너뜁니다.`, "warning");
        return null;
    }

    setGlobalLoading(true);
    const modelName = 'gemini-2.5-flash-preview-04-17';
    const promptText = `Provide details for the English word "${term}". Your response MUST be a JSON object with the following fields: "pronunciation" (phonetic, optional), "partOfSpeech" (e.g., noun, verb, adjective, in Korean e.g., 명사, 동사), "meaning" (Korean meaning), "exampleSentence" (simple English example), "exampleSentenceMeaning" (Korean translation of example). Ensure exampleSentence is appropriate for language learners. If "${term}" seems like a typo or not a common English word, try to correct it if obvious and return details for the corrected term, including the corrected "term" in the JSON. If correction is not obvious or it's not a word, return null for all fields.

Example JSON:
{
  "term": "person", 
  "pronunciation": "/ˈpɜːrsən/",
  "partOfSpeech": "명사",
  "meaning": "사람",
  "exampleSentence": "This is a person.",
  "exampleSentenceMeaning": "이것은 사람입니다."
}`;

    let currentDelay = initialDelay;

    try {
        for (let i = 0; i <= retries; i++) {
            try {
                console.log(`Gemini request for "${term}" (word details), attempt ${i + 1}/${retries + 1}`);
                const response: GenerateContentResponse = await ai.models.generateContent({
                    model: modelName,
                    contents: promptText,
                    config: {
                      responseMimeType: "application/json",
                      temperature: 0.5, 
                    }
                });
                
                let jsonStr = response.text?.trim() || '';
                const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
                const match = jsonStr.match(fenceRegex);
                if (match && match[2]) {
                    jsonStr = match[2].trim();
                }

                const data = JSON.parse(jsonStr) as Partial<Word>;
                
                if (!data.partOfSpeech || !data.meaning || !data.exampleSentence) {
                    console.warn("Gemini response missing essential fields for term:", term, data);
                    if (i < retries) { 
                        addToast(`AI가 '${term}'에 대한 정보를 일부 누락하여 반환했습니다. 재시도 중...(${i+1}/${retries+1})`, "warning");
                        await new Promise(resolve => setTimeout(resolve, currentDelay));
                        currentDelay *= 2;
                        continue; 
                    } else { 
                        addToast(`AI가 '${term}'에 대한 충분한 정보를 제공하지 못했습니다. (누락된 필드: 뜻, 품사, 또는 예문) 모든 시도 실패.`, "error");
                        return { term }; 
                    }
                }
                return data;

            } catch (error: any) {
                console.error(`Error fetching word details from Gemini for "${term}" (attempt ${i + 1}/${retries + 1}):`, error);
                const errorMessage = String(error.message || String(error)).toLowerCase();
                let resolvedHttpStatus;
                if (error && typeof error.status === 'number') {
                    resolvedHttpStatus = error.status;
                } else if (error && typeof error.code === 'number' && error.code >= 200 && error.code < 600) {
                    resolvedHttpStatus = error.code;
                }

                const is429StatusCode = resolvedHttpStatus === 429;
                const is429InMessage = errorMessage.includes('429');
                const isRateLimitError = is429StatusCode || is429InMessage;

                const isQuotaMessage = errorMessage.includes('resource_exhausted') ||
                                       errorMessage.includes('quota_exceeded') ||
                                       errorMessage.includes('exceeded your current quota');
                
                const isQuotaExhaustedError = isRateLimitError && isQuotaMessage;


                if (isQuotaExhaustedError) {
                    setGeminiQuotaExhaustedCooldown(addToast, `'${term}' 단어 정보 조회`);
                    return null; 
                }

                if (i < retries) { 
                    if (isRateLimitError) { 
                        addToast(`Gemini API 요청 빈도가 높아 '${term}' 정보 가져오기에 실패했습니다. ${currentDelay/1000}초 후 재시도합니다...`, "warning");
                    } else { 
                        addToast(`'${term}' 정보 가져오기 중 오류 발생. ${currentDelay/1000}초 후 재시도합니다...`, "warning");
                    }
                    await new Promise(resolve => setTimeout(resolve, currentDelay));
                    currentDelay *= 2;
                } else { 
                    if (isRateLimitError) {
                         addToast(`Gemini API 요청 빈도가 너무 높습니다 ('${term}'). 잠시 후 다시 시도해주세요.`, "error");
                    } else {
                        addToast(`'${term}'에 대한 세부 정보를 AI로부터 가져오는 데 최종 실패했습니다. (오류: ${error.message || String(error)})`, "error");
                    }
                    return null; 
                }
            }
        }
    } finally {
        setGlobalLoading(false);
    }
    console.warn(`generateWordDetailsWithGemini for "${term}" failed after all retries or due to unexpected flow.`);
    addToast(`'${term}'에 대한 단어 정보를 AI로부터 가져오는 데 최종 실패했습니다.`, "error");
    return null;
};

interface AIExampleSentence {
    newExampleSentence: string;
    newExampleSentenceMeaning: string;
}

const generateDifferentExampleSentenceWithGemini = async (word: Word, grade: string, addToast: (message: string, type: ToastMessage['type']) => void, setGlobalLoading: (loading: boolean) => void, retries = 2, initialDelay = 7000): Promise<AIExampleSentence | null> => {
    if (!ai) {
        addToast("AI 기능을 사용하려면 API 키가 필요합니다.", "warning");
        return null;
    }
     if (isCurrentlyGeminiQuotaExhausted) {
        addToast(`Gemini API 할당량이 이전에 감지되어 현재 API 호출이 중단된 상태입니다. '${word.term}'의 새 예문 생성을 건너뜁니다.`, "warning");
        return null;
    }
    setGlobalLoading(true);
    const modelName = 'gemini-2.5-flash-preview-04-17';
    const promptText = `You are an English vocabulary tutor for Korean students.
The user is learning the word: "${word.term}" (Part of speech: ${word.partOfSpeech}, Korean meaning: ${word.meaning}).
The user's current grade level is: ${grade}.
The user has already seen this example: "${word.exampleSentence}"

Generate ONE NEW, DIFFERENT, and SIMPLE English example sentence for the word "${word.term}" that is appropriate for a ${grade} Korean student.
The new example sentence should clearly illustrate the meaning of "${word.term}".
Your response MUST be a JSON object with the following fields:
"newExampleSentence": "The new English example sentence.",
"newExampleSentenceMeaning": "The Korean translation of the new example sentence."

Example JSON response:
{
  "newExampleSentence": "She showed great courage when she helped the lost child.",
  "newExampleSentenceMeaning": "그녀는 길 잃은 아이를 도왔을 때 대단한 용기를 보여주었다."
}`;

    let currentDelay = initialDelay;
    try {
        for (let i = 0; i <= retries; i++) {
            try {
                console.log(`Gemini request for new example for "${word.term}", attempt ${i + 1}/${retries + 1}`);
                const response: GenerateContentResponse = await ai.models.generateContent({
                    model: modelName,
                    contents: promptText,
                    config: {
                      responseMimeType: "application/json",
                      temperature: 0.7, 
                    }
                });
                
                let jsonStr = response.text?.trim() || '';
                const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
                const match = jsonStr.match(fenceRegex);
                if (match && match[2]) {
                    jsonStr = match[2].trim();
                }
                const data = JSON.parse(jsonStr) as AIExampleSentence;

                if (!data.newExampleSentence || !data.newExampleSentenceMeaning) {
                     console.warn("Gemini response missing newExampleSentence or newExampleSentenceMeaning for term:", word.term, data);
                     if (i < retries) {
                        addToast(`AI가 '${word.term}' 새 예문 정보를 일부 누락하여 반환했습니다. 재시도 중...`, "warning");
                        await new Promise(resolve => setTimeout(resolve, currentDelay));
                        currentDelay *= 2;
                        continue;
                     } else {
                        addToast(`AI가 '${word.term}'에 대한 새 예문 정보를 충분히 제공하지 못했습니다. 모든 시도 실패.`, "error");
                        return null;
                     }
                }
                return data;

            } catch (error: any) {
                console.error(`Error generating new example for "${word.term}" (attempt ${i + 1}/${retries + 1}):`, error);
                const errorMessage = String(error.message || String(error)).toLowerCase();
                let resolvedHttpStatus;
                if (error && typeof error.status === 'number') {
                    resolvedHttpStatus = error.status;
                } else if (error && typeof error.code === 'number' && error.code >= 200 && error.code < 600) {
                    resolvedHttpStatus = error.code;
                }

                const is429StatusCode = resolvedHttpStatus === 429;
                const is429InMessage = errorMessage.includes('429');
                const isRateLimitError = is429StatusCode || is429InMessage;

                const isQuotaMessage = errorMessage.includes('resource_exhausted') ||
                                       errorMessage.includes('quota_exceeded') ||
                                       errorMessage.includes('exceeded your current quota');
                
                const isQuotaExhaustedError = isRateLimitError && isQuotaMessage;

                if (isQuotaExhaustedError) {
                    setGeminiQuotaExhaustedCooldown(addToast, `'${word.term}' AI 예문 생성`);
                    return null; 
                }

                if (i < retries) { 
                    if (isRateLimitError) { 
                        addToast(`Gemini API 요청 빈도가 높아 '${word.term}' 새 예문 생성에 실패했습니다. ${currentDelay/1000}초 후 재시도합니다...`, "warning");
                    } else { 
                        addToast(`'${word.term}' 새 예문 생성 중 오류 발생. ${currentDelay/1000}초 후 재시도합니다...`, "warning");
                    }
                    await new Promise(resolve => setTimeout(resolve, currentDelay));
                    currentDelay *= 2; 
                } else { 
                    if (isRateLimitError) {
                        addToast(`Gemini API 요청 빈도가 너무 높습니다 ('${word.term}' 새 예문 생성). 잠시 후 다시 시도해주세요.`, "error");
                    } else {
                        addToast(`'${word.term}'에 대한 새로운 예문을 AI로부터 가져오는 데 최종 실패했습니다: ${error.message || String(error)}`, "error");
                    }
                    return null;
                }
            }
        }
    } finally {
        setGlobalLoading(false);
    }
    console.warn(`generateDifferentExampleSentenceWithGemini for "${word.term}" failed after all retries or due to unexpected flow.`);
    addToast(`'${word.term}'에 대한 새로운 예문을 AI로부터 가져오는 데 최종 실패했습니다.`, "error");
    return null;
};

const generateSummaryWithGemini = async (textToSummarize: string, addToast: (message: string, type: ToastMessage['type']) => void, setGlobalLoading: (loading: boolean) => void, retries = 2, initialDelay = 5000): Promise<string | null> => {
    if (!ai) {
        addToast("AI 요약 기능을 사용하려면 API 키가 필요합니다.", "warning");
        return null;
    }
    if (isCurrentlyGeminiQuotaExhausted) {
        addToast("Gemini API 할당량이 이전에 감지되어 현재 API 호출이 중단된 상태입니다. 텍스트 요약을 건너뜁니다.", "warning");
        return null;
    }
    if (!textToSummarize.trim()) {
        addToast("요약할 텍스트가 없습니다.", "info");
        return null;
    }
    setGlobalLoading(true);
    const modelName = 'gemini-2.5-flash-preview-04-17';
    const promptText = `Your response MUST be a JSON object with a "summary" field. Please provide a brief summary of the following text in Korean (around 2-3 sentences), focusing on the main topics or themes. Text: """${textToSummarize.substring(0, 30000)}"""`; 

    let currentDelay = initialDelay;
    try {
        for (let i = 0; i <= retries; i++) {
            try {
                console.log(`Gemini request for text summary, attempt ${i + 1}/${retries + 1}`);
                const response: GenerateContentResponse = await ai.models.generateContent({
                    model: modelName,
                    contents: promptText,
                    config: {
                        responseMimeType: "application/json",
                        temperature: 0.6,
                    }
                });

                let jsonStr = response.text?.trim() || '';
                const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
                const match = jsonStr.match(fenceRegex);
                if (match && match[2]) {
                    jsonStr = match[2].trim();
                }
                const data = JSON.parse(jsonStr) as { summary: string };

                if (!data.summary || !data.summary.trim()) {
                    console.warn("Gemini response missing summary field.", data);
                    if (i < retries) {
                        addToast(`AI 요약 생성 중 내용이 누락되었습니다. 재시도 중...`, "warning");
                        await new Promise(resolve => setTimeout(resolve, currentDelay));
                        currentDelay *= 2;
                        continue;
                    } else {
                        addToast(`AI가 텍스트 요약을 제공하지 못했습니다. 모든 시도 실패.`, "error");
                        return null;
                    }
                }
                return data.summary;

            } catch (error: any) {
                console.error(`Error generating summary from Gemini (attempt ${i + 1}/${retries + 1}):`, error);
                const errorMessage = String(error.message || String(error)).toLowerCase();
                let resolvedHttpStatus;
                if (error && typeof error.status === 'number') {
                    resolvedHttpStatus = error.status;
                } else if (error && typeof error.code === 'number' && error.code >= 200 && error.code < 600) {
                    resolvedHttpStatus = error.code;
                }

                const is429StatusCode = resolvedHttpStatus === 429;
                const is429InMessage = errorMessage.includes('429');
                const isRateLimitError = is429StatusCode || is429InMessage;

                const isQuotaMessage = errorMessage.includes('resource_exhausted') ||
                                       errorMessage.includes('quota_exceeded') ||
                                       errorMessage.includes('exceeded your current quota');
                
                const isQuotaExhaustedError = isRateLimitError && isQuotaMessage;

                if (isQuotaExhaustedError) {
                    setGeminiQuotaExhaustedCooldown(addToast, "텍스트 요약");
                    return null; 
                }

                if (i < retries) {
                    if (isRateLimitError) {
                        addToast(`Gemini API 요청 빈도가 높아 텍스트 요약에 실패했습니다. ${currentDelay / 1000}초 후 재시도합니다...`, "warning");
                    } else {
                        addToast(`텍스트 요약 중 오류 발생. ${currentDelay / 1000}초 후 재시도합니다...`, "warning");
                    }
                    await new Promise(resolve => setTimeout(resolve, currentDelay));
                    currentDelay *= 2;
                } else { 
                    if (isRateLimitError) {
                        addToast(`Gemini API 요청 빈도가 너무 높습니다 (텍스트 요약). 잠시 후 다시 시도해주세요.`, "error");
                    } else {
                        addToast(`텍스트 요약을 AI로부터 가져오는 데 최종 실패했습니다: ${error.message || String(error)}`, "error");
                    }
                    return null;
                }
            }
        }
    } finally {
        setGlobalLoading(false);
    }
     console.warn(`generateSummaryWithGemini failed after all retries or due to unexpected flow.`);
    addToast(`텍스트 요약을 AI로부터 가져오는 데 최종 실패했습니다.`, "error");
    return null;
};

// --- UI Components ---

// Confirmation Modal
interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
    confirmButtonClass?: string;
}
const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, title, message, onConfirm, onCancel, confirmText = "확인", cancelText = "취소", confirmButtonClass = "bg-red-600 hover:bg-red-700" }) => {
    const cancelButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (isOpen && cancelButtonRef.current) {
            cancelButtonRef.current.focus();
        }
    }, [isOpen]);
    
    if (!isOpen) return null;

    return (
        <div role="dialog" aria-modal="true" aria-labelledby="confirmation-modal-title" className="fixed inset-0 bg-slate-900 bg-opacity-75 flex justify-center items-center p-4 z-[60] animate-fadeIn">
            <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                <h3 id="confirmation-modal-title" className="text-xl font-semibold text-cyan-400 mb-4">{title}</h3>
                <p className="text-slate-300 mb-6">{message}</p>
                <div className="flex justify-end space-x-3">
                    <button ref={cancelButtonRef} onClick={onCancel} className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded text-white transition-colors">
                        {cancelText}
                    </button>
                    <button onClick={onConfirm} className={`px-4 py-2 rounded text-white transition-colors ${confirmButtonClass}`}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};


// Edit Settings Modal
interface EditSettingsModalProps {
    isOpen: boolean;
    currentSettings: UserSettings;
    onSave: (newSettings: UserSettings) => void;
    onCancel: () => void;
    addToast: (message: string, type: ToastMessage['type']) => void;
}
const EditSettingsModal: React.FC<EditSettingsModalProps> = ({ isOpen, currentSettings, onSave, onCancel, addToast }) => {
    const [username, setUsername] = useState(currentSettings.username);
    const [grade, setGrade] = useState(currentSettings.grade);
    const [dailyGoal, setDailyGoal] = useState(currentSettings.dailyGoal);
    const usernameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setUsername(currentSettings.username);
            setGrade(currentSettings.grade);
            setDailyGoal(currentSettings.dailyGoal);
            setTimeout(() => usernameInputRef.current?.focus(), 0); // Delay focus slightly for transition
        }
    }, [currentSettings, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) {
            addToast("사용자 이름은 비워둘 수 없습니다.", "warning");
            return;
        }
        onSave({ ...currentSettings, username: username.trim(), grade, dailyGoal });
    };

    return (
        <div role="dialog" aria-modal="true" aria-labelledby="edit-settings-modal-title" className="fixed inset-0 bg-slate-900 bg-opacity-75 flex justify-center items-center p-4 z-[60] animate-fadeIn">
            <div className="bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-md">
                <h3 id="edit-settings-modal-title" className="text-2xl font-bold text-cyan-400 mb-6 text-center">설정 변경</h3>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="edit-username" className="block text-sm font-medium text-slate-300 mb-1">사용자 이름</label>
                        <input
                            ref={usernameInputRef}
                            type="text"
                            id="edit-username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full p-3 bg-slate-700 text-white rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="edit-grade" className="block text-sm font-medium text-slate-300 mb-1">학년 선택</label>
                        <select
                            id="edit-grade"
                            value={grade}
                            onChange={(e) => setGrade(e.target.value)}
                            className="w-full p-3 bg-slate-700 text-white rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                        >
                            <option value="middle1">중학교 1학년</option>
                            <option value="middle2">중학교 2학년</option>
                            <option value="middle3">중학교 3학년</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="edit-dailyGoal" className="block text-sm font-medium text-slate-300 mb-1">일일 학습 목표 (단어 수)</label>
                        <input
                            type="number"
                            id="edit-dailyGoal"
                            value={dailyGoal}
                            onChange={(e) => setDailyGoal(Math.max(1, parseInt(e.target.value) || 1))}
                            min="1"
                            className="w-full p-3 bg-slate-700 text-white rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                        />
                    </div>
                    <div className="flex justify-end space-x-3 pt-2">
                        <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded text-white">취소</button>
                        <button type="submit" className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 rounded text-white">저장</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// Navigation Bar Component
interface NavBarProps {
    currentScreen: AppScreen;
    onNavigate: (screen: AppScreen) => void;
    userSettings: UserSettings | null;
    onOpenSettings: () => void;
}

const NavBar: React.FC<NavBarProps> = ({ currentScreen, onNavigate, userSettings, onOpenSettings }) => {
    const { isDarkMode, toggleTheme } = useTheme();
    const { isSpeaking, stopSpeaking } = useSpeech();
    
    const navItems: { screen: AppScreen; label: string; icon: string }[] = [
        { screen: 'dashboard', label: '대시보드', icon: '🏠' },
        { screen: 'learnWords', label: '단어 학습', icon: '📖' },
        { screen: 'quiz', label: '퀴즈', icon: '📝' },
        { screen: 'allWords', label: '전체 단어', icon: '📚' },
        { screen: 'manageWords', label: '단어 관리', icon: '➕' },
        { screen: 'stats', label: '통계', icon: '📊' },
    ];

    if (!userSettings) return null;

    return (
        <nav className={`${isDarkMode ? 'bg-slate-700' : 'bg-white shadow-sm border-b border-gray-200'} p-3 shadow-md transition-colors duration-200`}>
            <ul className="flex flex-wrap justify-around items-center space-x-1 sm:space-x-2">
                {navItems.map((item) => (
                    <li key={item.screen}>
                        <button
                            onClick={() => onNavigate(item.screen)}
                            aria-current={currentScreen === item.screen ? "page" : undefined}
                            className={`flex flex-col sm:flex-row items-center justify-center p-2 sm:px-3 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors duration-150 ease-in-out
                                ${currentScreen === item.screen
                                    ? isDarkMode
                                        ? 'bg-cyan-500 text-white shadow-lg ring-2 ring-cyan-300'
                                        : 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-300'
                                    : isDarkMode
                                        ? 'text-slate-300 hover:bg-slate-600 hover:text-white'
                                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                                }`}
                        >
                            <span className="text-lg sm:mr-2 mb-0.5 sm:mb-0">{item.icon}</span>
                            {item.label}
                        </button>
                    </li>
                ))}
                
                {/* Theme Toggle Button */}
                <li>
                    <button
                        onClick={toggleTheme}
                        title={isDarkMode ? '라이트 모드로 변경' : '다크 모드로 변경'}
                        aria-label={isDarkMode ? '라이트 모드로 변경' : '다크 모드로 변경'}
                        className={`flex flex-col sm:flex-row items-center justify-center p-2 sm:px-3 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors duration-150 ease-in-out ${
                            isDarkMode
                                ? 'text-slate-300 hover:bg-slate-600 hover:text-white'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                        }`}
                    >
                        <span className="text-lg sm:mr-2 mb-0.5 sm:mb-0">{isDarkMode ? '☀️' : '🌙'}</span>
                        <span className="hidden sm:inline">{isDarkMode ? '라이트' : '다크'}</span>
                        <span className="sm:hidden">테마</span>
                    </button>
                </li>

                {/* Speech Control Button */}
                {isSpeaking && (
                    <li>
                        <button
                            onClick={stopSpeaking}
                            title="음성 중지"
                            aria-label="음성 중지"
                            className="flex flex-col sm:flex-row items-center justify-center p-2 sm:px-3 sm:py-2 rounded-md text-xs sm:text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors duration-150 ease-in-out animate-pulse"
                        >
                            <span className="text-lg sm:mr-2 mb-0.5 sm:mb-0">🔇</span>
                            <span className="hidden sm:inline">음성중지</span>
                            <span className="sm:hidden">중지</span>
                        </button>
                    </li>
                )}
                
                <li>
                    <button
                        onClick={onOpenSettings}
                        title="설정 변경"
                        aria-label="설정 변경"
                        className={`flex flex-col sm:flex-row items-center justify-center p-2 sm:px-3 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors duration-150 ease-in-out ${
                            isDarkMode
                                ? 'text-slate-300 hover:bg-slate-600 hover:text-white'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                        }`}
                    >
                        <span className="text-lg sm:mr-2 mb-0.5 sm:mb-0">⚙️</span>
                        <span className="hidden sm:inline">설정</span>
                        <span className="sm:hidden">설정</span>
                    </button>
                </li>
            </ul>
        </nav>
    );
};


// Login/Setup Screen Component
interface LoginSetupScreenProps extends Omit<ScreenProps, 'userSettings' | 'setGlobalLoading' | 'addToast' | 'openSettingsModal'> {
    onSetupComplete: (settings: UserSettings) => void;
    addToast: (message: string, type: ToastMessage['type']) => void;
}

const LoginSetupScreen: React.FC<LoginSetupScreenProps> = ({ onNavigate, onSetupComplete, addToast }) => {
    const [username, setUsername] = useState('');
    const [grade, setGrade] = useState('middle1');
    const [dailyGoal, setDailyGoal] = useState(10);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) {
            addToast("사용자 이름을 입력해주세요.", "warning");
            return;
        }
        onSetupComplete({ username: username.trim(), grade, textbook: '', dailyGoal });
    };

    return (
        <div className="p-6 sm:p-8 bg-slate-800 min-h-screen flex flex-col justify-center items-center">
            <div className="w-full max-w-md bg-slate-700 p-8 rounded-xl shadow-2xl">
                <h1 className="text-3xl font-bold text-cyan-400 mb-8 text-center">AI 영단어 학습 설정</h1>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-1">사용자 이름</label>
                        <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full p-3 bg-slate-600 text-white rounded-md border border-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                            placeholder="이름을 입력하세요"
                            aria-required="true"
                        />
                    </div>
                    <div>
                        <label htmlFor="grade" className="block text-sm font-medium text-slate-300 mb-1">학년 선택</label>
                        <select
                            id="grade"
                            value={grade}
                            onChange={(e) => setGrade(e.target.value)}
                            className="w-full p-3 bg-slate-600 text-white rounded-md border border-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                            aria-required="true"
                        >
                            <option value="middle1">중학교 1학년</option>
                            <option value="middle2">중학교 2학년</option>
                            <option value="middle3">중학교 3학년</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="dailyGoal" className="block text-sm font-medium text-slate-300 mb-1">일일 학습 목표 (단어 수)</label>
                        <input
                            type="number"
                            id="dailyGoal"
                            value={dailyGoal}
                            onChange={(e) => setDailyGoal(Math.max(1, parseInt(e.target.value) || 1))}
                            min="1"
                            className="w-full p-3 bg-slate-600 text-white rounded-md border border-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                            aria-required="true"
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full py-3 px-4 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-md shadow-md transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-opacity-75"
                    >
                        학습 시작
                    </button>
                </form>
            </div>
        </div>
    );
};


// Dashboard Screen Component
interface DashboardScreenProps extends ScreenProps {
    myWords: Word[];
    learnedWordsToday: number;
    totalWordsLearned: number; 
}
const DashboardScreen: React.FC<DashboardScreenProps> = ({ userSettings, onNavigate, myWords, learnedWordsToday, totalWordsLearned }) => {
    return (
        <div className="p-6 sm:p-8">
            <h1 className="text-3xl font-bold text-cyan-400 mb-6">안녕하세요, {userSettings.username}님!</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-slate-700 p-6 rounded-lg shadow-lg">
                    <h2 className="text-xl font-semibold text-cyan-300 mb-2">오늘의 학습 목표</h2>
                    <p className="text-3xl font-bold text-white">{learnedWordsToday} / {userSettings.dailyGoal} 단어</p>
                    <div className="w-full bg-slate-600 rounded-full h-4 mt-3 overflow-hidden" role="progressbar" aria-valuenow={learnedWordsToday} aria-valuemin={0} aria-valuemax={userSettings.dailyGoal}>
                        <div
                            className="bg-green-500 h-4 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${Math.min(100, (learnedWordsToday / Math.max(1,userSettings.dailyGoal)) * 100)}%` }}
                        ></div>
                    </div>
                </div>
                <div className="bg-slate-700 p-6 rounded-lg shadow-lg">
                    <h2 className="text-xl font-semibold text-cyan-300 mb-2">총 학습 단어 (역대)</h2>
                    <p className="text-3xl font-bold text-white">{totalWordsLearned} 단어</p>
                     <p className="text-sm text-slate-400 mt-2">나의 단어 (커스텀): {myWords.length}개</p>
                </div>
            </div>
            <div className="space-y-4">
                <button
                    onClick={() => onNavigate('learnWords')}
                    className="w-full py-4 px-6 bg-cyan-500 hover:bg-cyan-600 text-white text-lg font-semibold rounded-lg shadow-md transition-colors duration-150 ease-in-out flex items-center justify-center"
                >
                    <span className="text-2xl mr-3" aria-hidden="true">📖</span> 단어 학습 시작하기
                </button>
                <button
                    onClick={() => onNavigate('quiz')}
                    className="w-full py-4 px-6 bg-green-500 hover:bg-green-600 text-white text-lg font-semibold rounded-lg shadow-md transition-colors duration-150 ease-in-out flex items-center justify-center"
                >
                     <span className="text-2xl mr-3" aria-hidden="true">📝</span> 퀴즈 풀기
                </button>
                 <button
                    onClick={() => onNavigate('manageWords')}
                    className="w-full py-4 px-6 bg-slate-600 hover:bg-slate-500 text-white text-lg font-semibold rounded-lg shadow-md transition-colors duration-150 ease-in-out flex items-center justify-center"
                >
                    <span className="text-2xl mr-3" aria-hidden="true">➕</span> 단어 관리하기
                </button>
            </div>
        </div>
    );
};


// LearnWords Screen Component
interface LearnWordsScreenProps extends ScreenProps {
    words: Word[];
    wordStats: Record<string | number, WordStat>;
    onWordLearned: (wordId: number | string, isQuickReview?: boolean) => void;
    updateWordStat: (wordId: string | number, newStat: Partial<Omit<WordStat, 'id'>>) => void;
}

const LearnWordsScreen: React.FC<LearnWordsScreenProps> = ({ userSettings, onNavigate, words, wordStats, onWordLearned, updateWordStat, addToast, setGlobalLoading }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentWordsSet, setCurrentWordsSet] = useState<Word[]>([]);
    const [showMeaning, setShowMeaning] = useState(false);
    const [isDailyGoalFinished, setIsDailyGoalFinished] = useState(false);
    const [isQuickReviewActive, setIsQuickReviewActive] = useState(false);
    const [isQuickReviewFinished, setIsQuickReviewFinished] = useState(false);

    const [aiExample, setAiExample] = useState<AIExampleSentence | null>(null);
    const [isFetchingAiExample, setIsFetchingAiExample] = useState(false);
    
    const getWordStat = useCallback((wordId: string | number) => {
        return wordStats[wordId] || getDefaultWordStat(wordId);
    }, [wordStats]);
    
    const selectWords = useCallback((count: number, forQuickReview: boolean) => {
        const today = getTodayDateString();
        let eligibleWords = words.filter(w => {
            const stat = getWordStat(w.id);
            return w.gradeLevel === userSettings.grade && !stat.isMastered;
        });

        if (forQuickReview) {
            eligibleWords = eligibleWords.filter(w => {
                const stat = getWordStat(w.id);
                return stat.lastReviewed && stat.lastReviewed.split('T')[0] !== today;
            });
        } else {
             eligibleWords = eligibleWords.filter(w => {
                const stat = getWordStat(w.id);
                return !stat.lastReviewed || stat.lastReviewed.split('T')[0] !== today;
             });
        }
        
        eligibleWords.sort((a, b) => {
            const statA = getWordStat(a.id);
            const statB = getWordStat(b.id);
            if (statB.quizIncorrectCount !== statA.quizIncorrectCount) return statB.quizIncorrectCount - statA.quizIncorrectCount;
            const dateA = statA.lastReviewed ? new Date(statA.lastReviewed).getTime() : 0;
            const dateB = statB.lastReviewed ? new Date(statB.lastReviewed).getTime() : 0;
            if (dateA !== dateB) return dateA - dateB;
            if (a.isCustom && !b.isCustom) return -1;
            if (!a.isCustom && b.isCustom) return 1;
            return 0;
        });
        return shuffleArray(eligibleWords).slice(0, count);
    }, [words, userSettings.grade, getWordStat]);


    useEffect(() => {
        const dailyWords = selectWords(userSettings.dailyGoal, false);
        setCurrentWordsSet(dailyWords);
        setCurrentIndex(0);
        setShowMeaning(false);
        setIsDailyGoalFinished(false);
        setIsQuickReviewActive(false);
        setIsQuickReviewFinished(false);
        setAiExample(null);
        setIsFetchingAiExample(false);

        if (dailyWords.length > 0 && dailyWords[0]) {
            speak(dailyWords[0].term);
        } else {
            setIsDailyGoalFinished(true); 
        }
    }, [words, userSettings.grade, userSettings.dailyGoal, selectWords]);

    const currentWord = currentWordsSet[currentIndex];

    const resetWordSpecificStates = () => {
        setShowMeaning(false);
        setAiExample(null);
        setIsFetchingAiExample(false);
    };

    const handleNextWord = () => {
        if (!currentWord) return;
        onWordLearned(currentWord.id, isQuickReviewActive);
        resetWordSpecificStates();

        const nextIndex = currentIndex + 1;
        if (nextIndex < currentWordsSet.length) {
            setCurrentIndex(nextIndex);
            if (currentWordsSet[nextIndex]) {
                 speak(currentWordsSet[nextIndex].term); 
            }
        } else {
            if (isQuickReviewActive) setIsQuickReviewFinished(true);
            else setIsDailyGoalFinished(true);
        }
    };
    
    const startQuickReview = () => {
        const reviewWords = selectWords(3, true); 
        if (reviewWords.length > 0 && reviewWords[0]) {
            setCurrentWordsSet(reviewWords);
            setCurrentIndex(0);
            resetWordSpecificStates();
            setIsQuickReviewActive(true);
            setIsQuickReviewFinished(false);
            speak(reviewWords[0].term);
        } else {
            addToast("복습할 이전 학습 단어가 더 이상 없습니다.", "info");
            setIsQuickReviewFinished(true); 
        }
    };

    const handleGenerateAiExample = async () => {
        if (!currentWord || !process.env.API_KEY) {
            if(!process.env.API_KEY) addToast("AI 예문 생성을 위해 API 키를 설정해주세요.", "warning");
            return;
        }
        setIsFetchingAiExample(true);
        setAiExample(null);
        const example = await generateDifferentExampleSentenceWithGemini(currentWord, userSettings.grade, addToast, setGlobalLoading);
        setAiExample(example);
        setIsFetchingAiExample(false);
    };

    if (currentWordsSet.length === 0 && !isDailyGoalFinished) { 
         return <div className="p-8 text-center text-xl">오늘 학습할 단어를 준비 중입니다...</div>;
    }
    
    if (isDailyGoalFinished && !isQuickReviewActive && !isQuickReviewFinished) {
        const potentialReviewWords = words.filter(w => {
            const stat = getWordStat(w.id);
            return w.gradeLevel === userSettings.grade && !stat.isMastered && stat.lastReviewed && stat.lastReviewed.split('T')[0] !== getTodayDateString();
        }).length;

        return (
            <div className="p-8 text-center">
                <h2 className="text-3xl font-bold text-cyan-400 mb-6">오늘의 학습 목표 완료! 🎉</h2>
                <p className="text-lg text-slate-300 mb-8">수고하셨습니다, {userSettings.username}님!</p>
                {potentialReviewWords > 0 ? (
                    <button
                        onClick={startQuickReview}
                        className="py-3 px-6 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg shadow-md mb-4"
                    >
                        💡 빠른 복습 시작하기 ({Math.min(3, potentialReviewWords)} 단어)
                    </button>
                ) : (
                    <p className="text-slate-400 mb-4">복습할 이전 학습 단어가 없습니다.</p>
                )}
                <button
                    onClick={() => onNavigate('dashboard')}
                    className="py-3 px-6 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg shadow-md"
                >
                    대시보드로 돌아가기
                </button>
            </div>
        );
    }
    
    if (isQuickReviewFinished) {
        return (
             <div className="p-8 text-center">
                <h2 className="text-3xl font-bold text-cyan-400 mb-6">빠른 복습 완료! 👍</h2>
                <p className="text-lg text-slate-300 mb-8">모든 학습 활동을 마쳤습니다!</p>
                <button
                    onClick={() => onNavigate('dashboard')}
                    className="py-3 px-6 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg shadow-md"
                >
                    대시보드로 돌아가기
                </button>
            </div>
        );
    }

    if (!currentWord) { 
        return (
            <div className="p-8 text-center">
                <h2 className="text-2xl font-bold text-slate-300 mb-4">학습할 단어를 불러오는 중...</h2>
                <button
                    onClick={() => onNavigate('dashboard')}
                    className="mt-4 py-3 px-6 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg shadow-md"
                >
                    대시보드로 돌아가기
                </button>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-8 flex flex-col items-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-400 mb-6 sm:mb-8">
                {isQuickReviewActive ? "빠른 복습" : "단어 학습"} ({currentIndex + 1} / {currentWordsSet.length})
            </h1>
            <div className="w-full max-w-lg bg-slate-700 rounded-xl shadow-2xl p-6 sm:p-8 text-center">
                <div className="mb-2">
                    <button onClick={() => speak(currentWord.term)} className="text-slate-400 hover:text-cyan-400 text-2xl" aria-label="단어 발음 듣기">
                        🔊
                    </button>
                </div>
                <h2 className="text-4xl sm:text-5xl font-bold text-white mb-3">{currentWord.term}</h2>
                {currentWord.pronunciation && <p className="text-slate-400 text-lg mb-2">[{currentWord.pronunciation}]</p>}
                
                <button
                    onClick={() => setShowMeaning(!showMeaning)}
                    className="w-full py-3 px-4 mb-4 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-md shadow transition-colors"
                    aria-expanded={showMeaning}
                >
                    {showMeaning ? '뜻 숨기기' : '뜻 보기'}
                </button>

                {showMeaning && (
                    <div className="bg-slate-600 p-4 sm:p-6 rounded-lg mb-4 text-left animate-fadeIn">
                        <p className="text-xl text-cyan-300 font-semibold mb-1">{currentWord.partOfSpeech}: {currentWord.meaning}</p>
                        <hr className="border-slate-500 my-3"/>
                        <p className="text-slate-200 mb-1"><span className="font-semibold">예문:</span> {currentWord.exampleSentence}</p>
                        {currentWord.exampleSentenceMeaning && <p className="text-sm text-slate-400"><span className="font-semibold">해석:</span> {currentWord.exampleSentenceMeaning}</p>}
                    
                        <div className="mt-4">
                            <button
                                onClick={handleGenerateAiExample}
                                disabled={isFetchingAiExample || !process.env.API_KEY || isCurrentlyGeminiQuotaExhausted}
                                className="w-full py-2 px-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-md shadow-sm disabled:opacity-50 flex items-center justify-center text-sm"
                            >
                                <span role="img" aria-label="ai" className="mr-2">✨</span>
                                {isFetchingAiExample ? 'AI 예문 생성 중...' : 'AI: 다른 예문'}
                                {(!process.env.API_KEY || isCurrentlyGeminiQuotaExhausted) && <span className="text-xs ml-1">({!process.env.API_KEY ? "Key 필요" : "Quota 소진"})</span>}
                            </button>
                        </div>
                        {aiExample && (
                            <div className="mt-3 pt-3 border-t border-slate-500 animate-fadeIn">
                                <p className="text-teal-300 font-semibold mb-1">✨ AI 추가 예문:</p>
                                <button onClick={() => speak(aiExample.newExampleSentence)} className="text-slate-400 hover:text-cyan-400 text-lg mr-1" aria-label="AI 예문 발음 듣기">🔊</button>
                                <span className="text-slate-200">{aiExample.newExampleSentence}</span>
                                <p className="text-sm text-slate-400 mt-0.5"><span className="font-semibold">해석:</span> {aiExample.newExampleSentenceMeaning}</p>
                            </div>
                        )}
                    </div>
                )}
                
                <button
                    onClick={handleNextWord}
                    className="w-full py-3 px-4 bg-green-500 hover:bg-green-600 text-white font-bold rounded-md shadow-lg transition-transform transform hover:scale-105"
                >
                    {currentIndex === currentWordsSet.length - 1 ? (isQuickReviewActive ? '복습 완료' : '학습 완료') : '다음 단어'}
                </button>
            </div>
            <button 
                onClick={() => onNavigate('dashboard')} 
                className="mt-8 text-sm text-cyan-400 hover:text-cyan-300"
            >
                {isQuickReviewActive ? "복습" : "학습"} 중단하고 대시보드로
            </button>
        </div>
    );
};

// Quiz Screen Component
interface QuizScreenProps extends ScreenProps {
    words: Word[];
    wordStats: Record<string | number, WordStat>;
    onQuizComplete: (score: number, totalQuestions: number, incorrectWords: Word[]) => void; 
    updateWordStat: (wordId: string | number, newStat: Partial<Omit<WordStat, 'id'>>) => void;
}

const QuizScreen: React.FC<QuizScreenProps> = ({ userSettings, onNavigate, words, wordStats, onQuizComplete, updateWordStat, addToast, setGlobalLoading }) => {
    const [quizWords, setQuizWords] = useState<Word[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [score, setScore] = useState(0);
    const [showResult, setShowResult] = useState(false);
    const [options, setOptions] = useState<string[]>([]);
    const [isFinished, setIsFinished] = useState(false);
    const [incorrectlyAnsweredWordsDetails, setIncorrectlyAnsweredWordsDetails] = useState<Word[]>([]);
    
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [reviewWord, setReviewWord] = useState<Word | null>(null);
    const [aiReviewExample, setAiReviewExample] = useState<AIExampleSentence | null>(null);
    const [isFetchingAiReviewExample, setIsFetchingAiReviewExample] = useState(false);
    const reviewModalCloseButtonRef = useRef<HTMLButtonElement>(null);


    const getWordStat = useCallback((wordId: string | number) => {
        return wordStats[wordId] || getDefaultWordStat(wordId);
    }, [wordStats]);

    const generateOptions = useCallback((correctWord: Word) => {
        const gradeWords = words.filter(w => w.gradeLevel === userSettings.grade);
        let incorrectMeaningPool = shuffleArray(
            gradeWords
                .filter(w => w.id !== correctWord.id) 
                .map(w => w.meaning)
                .filter(meaning => meaning !== correctWord.meaning) 
        );
        const uniqueIncorrectOptions = Array.from(new Set(incorrectMeaningPool)).slice(0, 3);
        const finalGeneratedOptions = shuffleArray([correctWord.meaning, ...uniqueIncorrectOptions]);
        setOptions(finalGeneratedOptions);
    }, [words, userSettings.grade]);


    useEffect(() => {
        const gradeFilteredWords = words.filter(w => w.gradeLevel === userSettings.grade);
        if (gradeFilteredWords.length < 4) { 
            setQuizWords([]);
            setIsFinished(true);
            if (gradeFilteredWords.length > 0) addToast(`현재 학년에 퀴즈를 위한 단어가 부족합니다. (최소 4개 필요)`, "warning");
            return;
        }
        const actualNumQuizQuestions = Math.min(10, gradeFilteredWords.length);
        const selectedQuizWords = shuffleArray(gradeFilteredWords).slice(0, actualNumQuizQuestions);
        setQuizWords(selectedQuizWords);
        setCurrentQuestionIndex(0);
        setScore(0);
        setSelectedAnswer(null);
        setShowResult(false);
        setIsFinished(false);
        setIncorrectlyAnsweredWordsDetails([]);
        if (selectedQuizWords.length > 0 && selectedQuizWords[0]) { 
            generateOptions(selectedQuizWords[0]);
            speak(selectedQuizWords[0].term);
        }
    }, [words, userSettings.grade, generateOptions, addToast]);

    useEffect(() => {
        if (showReviewModal && reviewModalCloseButtonRef.current) {
            setTimeout(() => reviewModalCloseButtonRef.current?.focus(), 0);
        }
    }, [showReviewModal]);


     const handleOpenReviewModal = async (word: Word) => {
        setReviewWord(word);
        setShowReviewModal(true);
        setAiReviewExample(null);
        if (process.env.API_KEY) {
            setIsFetchingAiReviewExample(true);
            // Use setGlobalLoading for this specific AI call within the modal as it's a primary action here
            const example = await generateDifferentExampleSentenceWithGemini(word, userSettings.grade, addToast, setGlobalLoading);
            setAiReviewExample(example);
            setIsFetchingAiReviewExample(false);
        }
    };

    if (quizWords.length === 0 && !isFinished) { 
        return <div className="p-8 text-center text-xl">퀴즈를 위한 단어를 준비 중이거나, 현재 학년에 단어가 부족합니다. (최소 4개 필요)</div>;
    }
    
    if (isFinished) { 
        return (
            <div className="p-8 text-center">
                <h2 className="text-3xl font-bold text-cyan-400 mb-4">퀴즈 완료! 🏆</h2>
                {quizWords.length > 0 ? (
                    <p className="text-xl text-slate-200 mb-6">총 {quizWords.length}문제 중 <span className="text-green-400 font-bold">{score}</span>문제를 맞혔습니다.</p>
                ) : (
                    <p className="text-xl text-slate-200 mb-6">퀴즈를 진행할 단어가 없습니다. '단어 관리'에서 단어를 추가하거나 다른 학년을 선택해보세요. (최소 4개 필요)</p>
                )}
                {incorrectlyAnsweredWordsDetails.length > 0 && (
                    <div className="mb-6 bg-slate-700 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold text-red-400 mb-2">틀린 단어들:</h3>
                        <ul className="space-y-2 text-left max-h-48 overflow-y-auto">
                            {incorrectlyAnsweredWordsDetails.map(word => (
                                <li key={word.id} className="flex justify-between items-center p-1.5 bg-slate-600 rounded-md">
                                    <span className="text-slate-300">{word.term} - {word.meaning}</span>
                                    <button 
                                        onClick={() => handleOpenReviewModal(word)}
                                        className="text-teal-400 hover:text-teal-300 text-sm flex items-center px-2 py-1 rounded hover:bg-slate-500 disabled:opacity-50"
                                        aria-label={`${word.term} AI 복습`}
                                        disabled={!process.env.API_KEY || isCurrentlyGeminiQuotaExhausted || isFetchingAiReviewExample}
                                    >
                                        ✨ AI 복습 {(!process.env.API_KEY || isCurrentlyGeminiQuotaExhausted) && <span className="text-xs ml-1">({!process.env.API_KEY ? "Key 필요" : "Quota 소진"})</span>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                <div className="space-x-4">
                    <button
                        onClick={() => { 
                            const gradeFilteredRetryWords = words.filter(w => w.gradeLevel === userSettings.grade);
                            if (gradeFilteredRetryWords.length < 4) {
                                addToast("퀴즈를 다시 풀기 위한 단어가 부족합니다. (최소 4개 필요)", "warning");
                                return;
                            }
                            const actualRetryNumQuestions = Math.min(10, gradeFilteredRetryWords.length);
                            const selectedRetryQuizWords = shuffleArray(gradeFilteredRetryWords).slice(0, actualRetryNumQuestions);
                            setQuizWords(selectedRetryQuizWords);
                            setCurrentQuestionIndex(0);
                            setScore(0);
                            setSelectedAnswer(null);
                            setShowResult(false);
                            setIsFinished(false); 
                            setIncorrectlyAnsweredWordsDetails([]);
                            if (selectedRetryQuizWords.length > 0 && selectedRetryQuizWords[0]) {
                                generateOptions(selectedRetryQuizWords[0]);
                                speak(selectedRetryQuizWords[0].term); 
                            }
                        }}
                        className="py-3 px-6 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg shadow-md disabled:opacity-60"
                        disabled={words.filter(w => w.gradeLevel === userSettings.grade).length < 4}
                    >
                        다시 풀기
                    </button>
                    <button
                        onClick={() => onNavigate('dashboard')}
                        className="py-3 px-6 bg-slate-600 hover:bg-slate-500 text-white font-semibold rounded-lg shadow-md"
                    >
                        대시보드로
                    </button>
                </div>
                 {showReviewModal && reviewWord && (
                    <div role="dialog" aria-modal="true" aria-labelledby="ai-review-modal-title" className="fixed inset-0 bg-slate-900 bg-opacity-75 flex justify-center items-center p-4 z-50 animate-fadeIn">
                        <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-lg text-left">
                            <h3 id="ai-review-modal-title" className="text-xl font-semibold text-cyan-400 mb-3">✨ AI 단어 복습: {reviewWord.term}</h3>
                            <p className="text-slate-300"><span className="font-semibold">뜻:</span> {reviewWord.meaning} ({reviewWord.partOfSpeech})</p>
                            {reviewWord.pronunciation && <p className="text-slate-400 text-sm">[{reviewWord.pronunciation}]</p>}
                            <hr className="my-3 border-slate-700"/>
                            <p className="text-slate-300 mb-1"><span className="font-semibold">기존 예문:</span> {reviewWord.exampleSentence}</p>
                            <p className="text-sm text-slate-400 mb-3">{reviewWord.exampleSentenceMeaning}</p>
                            
                            {isFetchingAiReviewExample && <p className="text-teal-400">AI 추가 예문 생성 중...</p>}
                            {aiReviewExample && (
                                <div className="mt-2 pt-2 border-t border-slate-600 animate-fadeIn">
                                    <p className="text-teal-300 font-semibold mb-1">✨ AI 추가 예문:</p>
                                     <button onClick={() => speak(aiReviewExample.newExampleSentence)} className="text-slate-400 hover:text-cyan-400 text-lg mr-1" aria-label="AI 예문 발음 듣기">🔊</button>
                                    <span className="text-slate-200">{aiReviewExample.newExampleSentence}</span>
                                    <p className="text-sm text-slate-400 mt-0.5">{aiReviewExample.newExampleSentenceMeaning}</p>
                                </div>
                            )}
                            {!isFetchingAiReviewExample && !aiReviewExample && process.env.API_KEY && !isCurrentlyGeminiQuotaExhausted &&
                                <p className="text-red-400 text-sm">AI 추가 예문 생성에 실패했습니다.</p>
                            }
                             {!process.env.API_KEY && <p className="text-yellow-400 text-sm">AI 예문 생성은 API 키가 필요합니다.</p>}
                             {isCurrentlyGeminiQuotaExhausted && <p className="text-yellow-400 text-sm">Gemini API 할당량이 소진되어 AI 예문 생성을 할 수 없습니다.</p>}
                            <button 
                                ref={reviewModalCloseButtonRef} 
                                onClick={() => setShowReviewModal(false)} 
                                className="mt-4 w-full py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded">닫기</button>
                        </div>
                    </div>
                )}
            </div>
        );
    }
    
    const currentWord = quizWords[currentQuestionIndex];
    if (!currentWord) { 
        return <div className="p-8 text-center">퀴즈 단어 로딩 중... 또는 더 이상 문제가 없습니다. 대시보드로 돌아가세요.</div>;
    }

    const handleAnswerSelection = (answer: string) => {
        if (showResult) return;
        setSelectedAnswer(answer);
        setShowResult(true);
        if (answer === currentWord.meaning) {
            setScore(score + 1);
        } else {
            setIncorrectlyAnsweredWordsDetails(prev => [...prev, currentWord]);
            const currentStat = getWordStat(currentWord.id);
            updateWordStat(currentWord.id, { quizIncorrectCount: currentStat.quizIncorrectCount + 1 });
        }
    };

    const handleNextQuestion = () => {
        if (currentQuestionIndex < quizWords.length - 1) {
            const nextQuestionWord = quizWords[currentQuestionIndex + 1];
            if (nextQuestionWord) {
                speak(nextQuestionWord.term); 
            }
            setCurrentQuestionIndex(currentQuestionIndex + 1);
            setSelectedAnswer(null);
            setShowResult(false);
            if (nextQuestionWord) {
                generateOptions(nextQuestionWord);
            }
        } else {
            onQuizComplete(score, quizWords.length, incorrectlyAnsweredWordsDetails);
            setIsFinished(true);
        }
    };
    
    return (
        <div className="p-4 sm:p-8 flex flex-col items-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-400 mb-4">퀴즈 ({currentQuestionIndex + 1} / {quizWords.length})</h1>
            <div className="w-full max-w-xl bg-slate-700 rounded-xl shadow-2xl p-6 sm:p-8">
                <div className="w-full bg-slate-600 rounded-full h-2.5 mb-6">
                    <div 
                        className="bg-cyan-500 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
                        style={{ width: `${quizWords.length > 0 ? ((currentQuestionIndex + 1) / quizWords.length) * 100 : 0}%` }}
                        aria-valuenow={currentQuestionIndex + 1}
                        aria-valuemin={0} 
                        aria-valuemax={quizWords.length > 0 ? quizWords.length : 1}
                        role="progressbar"
                        aria-label="Quiz progress"
                    ></div>
                </div>
                <div className="text-center mb-6">
                    <p className="text-slate-400 text-sm mb-1">다음 단어의 뜻은 무엇일까요?</p>
                    <div className="flex items-center justify-center">
                        <h2 className="text-4xl sm:text-5xl font-bold text-white mr-2">{currentWord.term}</h2>
                        <button onClick={() => speak(currentWord.term)} className="text-slate-400 hover:text-cyan-400 text-2xl" aria-label="단어 발음 듣기">
                            🔊
                        </button>
                    </div>
                     {currentWord.pronunciation && <p className="text-slate-400 text-lg">[{currentWord.pronunciation}]</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6">
                    {options.map((option, index) => (
                        <button
                            key={option + '-' + index} 
                            onClick={() => handleAnswerSelection(option)}
                            disabled={showResult}
                            className={`w-full p-3 sm:p-4 text-left rounded-lg shadow-md transition-all duration-150 ease-in-out
                                ${showResult
                                    ? option === currentWord.meaning
                                        ? 'bg-green-500 text-white ring-2 ring-green-300 scale-105'
                                        : option === selectedAnswer
                                            ? 'bg-red-500 text-white ring-2 ring-red-300' 
                                            : 'bg-slate-600 text-slate-300 opacity-70'
                                    : 'bg-slate-600 hover:bg-cyan-700 text-white focus:bg-cyan-700'
                                }`}
                            aria-pressed={selectedAnswer === option}
                        >
                            {option}
                        </button>
                    ))}
                </div>

                {showResult && (
                    <div className={`text-center p-3 mb-4 rounded-md text-white ${selectedAnswer === currentWord.meaning ? 'bg-green-600' : 'bg-red-600'} animate-fadeIn`}>
                        {selectedAnswer === currentWord.meaning ? '🎉 정답입니다!' : `❌ 오답입니다. 정답: ${currentWord.meaning}`}
                    </div>
                )}

                <button
                    onClick={handleNextQuestion}
                    disabled={!showResult}
                    className="w-full py-3 px-4 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-md shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {currentQuestionIndex === quizWords.length - 1 ? '결과 보기' : '다음 문제'}
                </button>
            </div>
             <button 
                onClick={() => onNavigate('dashboard')} 
                className="mt-8 text-sm text-cyan-400 hover:text-cyan-300"
            >
                퀴즈 중단하고 대시보드로
            </button>
        </div>
    );
};


// Shared EditWordModal Component
const EditWordModal = ({ 
    word, 
    onSave, 
    onCancel, 
    userGrade, 
    isCustomWordOnly, 
    addToast, 
    setGlobalLoading 
}: { 
    word: Word, 
    onSave: (updatedWord: Word) => Promise<void>, 
    onCancel: () => void, 
    userGrade: string, 
    isCustomWordOnly?: boolean, 
    addToast: (message: string, type: ToastMessage['type']) => void, 
    setGlobalLoading: (loading: boolean) => void 
}) => {
    const [editableWord, setEditableWord] = useState<Word>(JSON.parse(JSON.stringify(word))); // Deep copy
    const [isFetchingModalAIDetails, setIsFetchingModalAIDetails] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const termInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setEditableWord(JSON.parse(JSON.stringify(word)));
        setTimeout(() => termInputRef.current?.focus(), 0);
    }, [word]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setEditableWord(prev => ({ ...prev, [name]: value }));
    };
    
    const handleAIFillDetails = async () => {
        if (!editableWord.term?.trim() || !process.env.API_KEY) {
             addToast(process.env.API_KEY ? "AI로 정보를 가져올 단어를 입력해주세요." : "AI 정보 채우기를 위해 API 키를 설정해주세요.", "warning");
            return;
        }
        if (isCurrentlyGeminiQuotaExhausted) {
             addToast("Gemini API 할당량이 소진되어 AI 정보 채우기를 할 수 없습니다.", "warning");
             return;
        }
        setIsFetchingModalAIDetails(true);
        const details = await generateWordDetailsWithGemini(editableWord.term.trim(), addToast, setGlobalLoading);
        if (details) {
            setEditableWord(prev => ({
                ...prev,
                term: details.term || prev.term,
                pronunciation: details.pronunciation || prev.pronunciation,
                meaning: details.meaning || prev.meaning,
                partOfSpeech: details.partOfSpeech || prev.partOfSpeech,
                exampleSentence: details.exampleSentence || prev.exampleSentence,
                exampleSentenceMeaning: details.exampleSentenceMeaning || prev.exampleSentenceMeaning,
            }));
        }
        setIsFetchingModalAIDetails(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (word.isCustom || !isCustomWordOnly) { // Apply validation only if fields are editable
            const { term, meaning, partOfSpeech, exampleSentence } = editableWord;
            if (!term?.trim() || !meaning?.trim() || !partOfSpeech?.trim() || !exampleSentence?.trim()) {
                addToast("단어, 뜻, 품사, 예문은 필수 항목입니다. 모두 채워주세요.", "warning");
                return;
            }
        }

        setIsSubmitting(true);
        await onSave(editableWord);
        setIsSubmitting(false); 
    };
    
    const canEditFields = word.isCustom || !isCustomWordOnly;

    return (
        <div role="dialog" aria-modal="true" aria-labelledby={`edit-word-modal-title-${word.id}`} className="fixed inset-0 bg-slate-900 bg-opacity-75 flex justify-center items-center p-4 z-50 overflow-y-auto animate-fadeIn">
            <form onSubmit={handleSubmit} className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-lg space-y-3 my-4">
                <h3 id={`edit-word-modal-title-${word.id}`} className="text-xl font-semibold text-cyan-400">단어 {canEditFields ? '수정' : '세부정보'}: {word.term}</h3>
                <div>
                    <label htmlFor={`term-modal-${word.id}`} className="block text-sm font-medium text-slate-300">단어 (필수)</label>
                    <input ref={termInputRef} type="text" name="term" id={`term-modal-${word.id}`} value={editableWord.term} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-700 rounded text-white" required disabled={!canEditFields}/>
                </div>
                 <button
                    type="button"
                    onClick={handleAIFillDetails}
                    disabled={isFetchingModalAIDetails || !process.env.API_KEY || !canEditFields || isCurrentlyGeminiQuotaExhausted || isSubmitting}
                    className="w-full my-1 py-2 px-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-md shadow-sm disabled:opacity-50 flex items-center justify-center text-sm"
                >
                    <span role="img" aria-label="ai" className="mr-2">✨</span>
                    {isFetchingModalAIDetails ? 'AI 정보 가져오는 중...' : 'AI로 나머지 정보 채우기'}
                     {(!process.env.API_KEY || !canEditFields || isCurrentlyGeminiQuotaExhausted) && <span className="text-xs ml-1">({!canEditFields ? "사용자 단어만 가능" : (!process.env.API_KEY ? "API Key 필요" : "Quota 소진")})</span>}
                </button>
                <div>
                    <label htmlFor={`meaning-modal-${word.id}`} className="block text-sm font-medium text-slate-300">뜻 (필수)</label>
                    <input type="text" name="meaning" id={`meaning-modal-${word.id}`} value={editableWord.meaning} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-700 rounded text-white" required disabled={!canEditFields}/>
                </div>
                <div>
                    <label htmlFor={`partOfSpeech-modal-${word.id}`} className="block text-sm font-medium text-slate-300">품사 (필수)</label>
                    <input type="text" name="partOfSpeech" id={`partOfSpeech-modal-${word.id}`} value={editableWord.partOfSpeech} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-700 rounded text-white" required disabled={!canEditFields}/>
                </div>
                <div>
                    <label htmlFor={`pronunciation-modal-${word.id}`} className="block text-sm font-medium text-slate-300">발음기호 (선택)</label>
                    <input type="text" name="pronunciation" id={`pronunciation-modal-${word.id}`} value={editableWord.pronunciation || ''} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-700 rounded text-white" disabled={!canEditFields}/>
                </div>
                <div>
                    <label htmlFor={`exampleSentence-modal-${word.id}`} className="block text-sm font-medium text-slate-300">예문 (필수)</label>
                    <textarea name="exampleSentence" id={`exampleSentence-modal-${word.id}`} value={editableWord.exampleSentence} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-700 rounded text-white" rows={2} required disabled={!canEditFields}/>
                </div>
                <div>
                    <label htmlFor={`exampleSentenceMeaning-modal-${word.id}`} className="block text-sm font-medium text-slate-300">예문 뜻 (선택)</label>
                    <textarea name="exampleSentenceMeaning" id={`exampleSentenceMeaning-modal-${word.id}`} value={editableWord.exampleSentenceMeaning || ''} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-700 rounded text-white" rows={2} disabled={!canEditFields}/>
                </div>
                 <div>
                    <label htmlFor={`gradeLevel-modal-${word.id}`} className="block text-sm font-medium text-slate-300">학년 (필수)</label>
                    <select name="gradeLevel" id={`gradeLevel-modal-${word.id}`} value={editableWord.gradeLevel} onChange={handleChange} className="w-full p-2 mt-1 bg-slate-700 rounded text-white" disabled={!canEditFields}>
                        <option value="middle1">중1</option>
                        <option value="middle2">중2</option>
                        <option value="middle3">중3</option>
                    </select>
                </div>

                <div className="flex justify-end space-x-3 pt-2">
                    <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded text-white">취소</button>
                    {canEditFields && <button type="submit" className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 rounded text-white" disabled={isSubmitting || isFetchingModalAIDetails}>
                      {isSubmitting ? '저장 중...' : '저장'}
                    </button>}
                </div>
            </form>
        </div>
    );
};


// AllWords Screen Component
interface AllWordsScreenProps extends ScreenProps {
    allWords: Word[]; 
    wordStats: Record<string | number, WordStat>;
    onDeleteCustomWord: (wordId: number | string) => void;
    onSaveCustomWord: (wordData: Partial<Word>, gradeLevelForNew?: string) => Promise<boolean>;
    updateWordStat: (wordId: string | number, newStat: Partial<Omit<WordStat, 'id'>>) => void;
}

const AllWordsScreen: React.FC<AllWordsScreenProps> = ({ userSettings, onNavigate, allWords, wordStats, onDeleteCustomWord, onSaveCustomWord, updateWordStat, addToast, setGlobalLoading }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterGrade, setFilterGrade] = useState<string>(userSettings.grade || 'all');
    const [editingWord, setEditingWord] = useState<Word | null>(null);
    const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
    const [wordToDelete, setWordToDelete] = useState<Word | null>(null);
    
    const getWordStat = useCallback((wordId: string | number) => {
        return wordStats[wordId] || getDefaultWordStat(wordId);
    }, [wordStats]);

    const wordsToDisplay = useMemo(() => {
        return allWords
        .filter(word => filterGrade === 'all' || word.gradeLevel === filterGrade)
        .filter(word => word.term.toLowerCase().includes(searchTerm.toLowerCase()) || word.meaning.toLowerCase().includes(searchTerm.toLowerCase()))
        .map(word => ({ ...word, stat: getWordStat(word.id) })) 
        .sort((a,b) => a.term.localeCompare(b.term));
    }, [allWords, filterGrade, searchTerm, getWordStat]);


    const handleEditWord = (word: Word) => {
        setEditingWord(JSON.parse(JSON.stringify(word))); 
    };
    
    const handleSaveEdit = async (updatedWord: Word) => {
        if (updatedWord.isCustom) { 
            const success = await onSaveCustomWord(updatedWord);
            if (success) {
                setEditingWord(null);
            }
        } else {
            // For non-custom words, if this modal is used (e.g. for viewing details via 'ℹ️ 정보'),
            // it shouldn't attempt to save them as custom. The EditWordModal's handleSubmit
            // should prevent onSave from being called if !canEditFields,
            // or we ensure onSave is robust enough if called.
            addToast("기본 제공 단어는 이 화면에서 직접 수정할 수 없습니다. '정보 보기' 전용입니다.", "info");
            setEditingWord(null); 
        }
    };

    const handleDeleteClick = (word: Word) => {
        setWordToDelete(word);
        setShowConfirmDeleteModal(true);
    };

    const confirmDelete = () => {
        if(wordToDelete) {
            onDeleteCustomWord(wordToDelete.id);
        }
        setShowConfirmDeleteModal(false);
        setWordToDelete(null);
    };

    const toggleMastered = (word: Word) => {
        const currentStat = getWordStat(word.id);
        updateWordStat(word.id, { isMastered: !currentStat.isMastered });
        addToast(
            `'${word.term}' 단어를 ${!currentStat.isMastered ? '완료' : '학습 필요'} 상태로 변경했습니다.`,
            !currentStat.isMastered ? "success" : "info"
        );
    };
    

    return (
        <div className="p-4 sm:p-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-400 mb-6">전체 단어 목록 ({wordsToDisplay.length}개)</h1>
            <div className="mb-6 flex flex-col sm:flex-row gap-4">
                <input
                    type="text"
                    placeholder="단어 또는 뜻 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-grow p-3 bg-slate-700 text-white rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500"
                    aria-label="단어 검색"
                />
                <select
                    value={filterGrade}
                    onChange={(e) => setFilterGrade(e.target.value)}
                    className="p-3 bg-slate-700 text-white rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500"
                    aria-label="학년 필터"
                >
                    <option value="all">모든 학년</option>
                    <option value="middle1">중학교 1학년</option>
                    <option value="middle2">중학교 2학년</option>
                    <option value="middle3">중학교 3학년</option>
                </select>
            </div>

            {wordsToDisplay.length > 0 ? (
                <ul className="space-y-3">
                    {wordsToDisplay.map((word) => (
                        <li key={word.id} className={`p-4 rounded-lg shadow transition-colors ${word.stat.isMastered ? 'bg-slate-700/70 hover:bg-slate-600/70' : 'bg-slate-700 hover:bg-slate-600'}`}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className={`text-xl font-semibold ${word.stat.isMastered ? 'text-green-400' : 'text-cyan-300'}`}>
                                        {word.term} 
                                        {word.stat.isMastered && <span className="text-xs bg-green-500 text-slate-900 px-1.5 py-0.5 rounded-full ml-2">완료</span>}
                                        {word.isCustom && !word.stat.isMastered && <span className="text-xs bg-yellow-500 text-slate-900 px-1.5 py-0.5 rounded-full ml-2">나의 단어</span>}
                                        {word.isCustom && word.stat.isMastered && <span className="text-xs bg-yellow-500 text-slate-900 px-1.5 py-0.5 rounded-full ml-2">나의 단어</span>}

                                    </h3>
                                    <p className="text-sm text-slate-300">{word.partOfSpeech} - {word.meaning}</p>
                                    <p className="text-xs text-slate-400 mt-1">학년: {word.gradeLevel} | 복습: {word.stat.lastReviewed ? new Date(word.stat.lastReviewed).toLocaleDateString() : '안함'} | 오답: {word.stat.quizIncorrectCount}</p>
                                </div>
                                <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-1 flex-shrink-0 ml-2 items-end">
                                     <button onClick={() => speak(word.term)} className="text-slate-400 hover:text-cyan-400 text-xl p-1.5 rounded-md hover:bg-slate-500" aria-label={`${word.term} 발음 듣기`}>
                                        🔊
                                    </button>
                                    <button 
                                        onClick={() => toggleMastered(word)}
                                        className={`p-1.5 rounded-md text-sm whitespace-nowrap ${word.stat.isMastered ? 'bg-slate-500 hover:bg-slate-400 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}
                                        aria-label={word.stat.isMastered ? `${word.term} 학습 필요로 표시` : `${word.term} 마스터함으로 표시`}
                                    >
                                        {word.stat.isMastered ? '🔄 학습 필요' : '✅ 완료'}
                                    </button>
                                   {word.isCustom ? (
                                        <>
                                            <button 
                                                onClick={() => handleEditWord(word)} 
                                                className="text-yellow-400 hover:text-yellow-300 p-1.5 rounded-md hover:bg-slate-500 text-sm whitespace-nowrap"
                                                aria-label={`${word.term} 수정`}
                                            >✏️ 수정</button>
                                            <button 
                                                onClick={() => handleDeleteClick(word)} 
                                                className="text-red-400 hover:text-red-300 p-1.5 rounded-md hover:bg-slate-500 text-sm whitespace-nowrap"
                                                aria-label={`${word.term} 삭제`}
                                            >🗑️ 삭제</button>
                                        </>
                                    ) : (
                                         <button 
                                            onClick={() => handleEditWord(word)} 
                                            className="text-sky-400 hover:text-sky-300 p-1.5 rounded-md hover:bg-slate-500 text-sm whitespace-nowrap"
                                            aria-label={`${word.term} 세부 정보 보기`}
                                        >ℹ️ 정보</button>
                                    )}
                                </div>
                            </div>
                             {word.exampleSentence && (
                                <details className="mt-2 text-sm">
                                    <summary className="cursor-pointer text-slate-400 hover:text-slate-200">예문 보기</summary>
                                    <div className="mt-1 p-2 bg-slate-600 rounded">
                                        <p className="text-slate-200">{word.exampleSentence}</p>
                                        {word.exampleSentenceMeaning && <p className="text-slate-400 text-xs mt-0.5">{word.exampleSentenceMeaning}</p>}
                                    </div>
                                </details>
                            )}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-center text-slate-400 py-8">해당 조건에 맞는 단어가 없습니다.</p>
            )}
            {editingWord && <EditWordModal word={editingWord} onSave={handleSaveEdit} onCancel={() => setEditingWord(null)} userGrade={userSettings.grade} isCustomWordOnly={!editingWord.isCustom} addToast={addToast} setGlobalLoading={setGlobalLoading}/>}
            {wordToDelete && (
                <ConfirmationModal
                    isOpen={showConfirmDeleteModal}
                    title="단어 삭제 확인"
                    message={`'${wordToDelete.term}' 단어를 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
                    onConfirm={confirmDelete}
                    onCancel={() => { setShowConfirmDeleteModal(false); setWordToDelete(null); }}
                />
            )}
        </div>
    );
};

// Stats Screen Component
interface StatsScreenProps extends ScreenProps {
    learnedWordsHistory: { date: string; count: number }[]; 
    quizHistory: { date: string; score: number; total: number }[];
    allWords: Word[]; 
    wordStats: Record<string | number, WordStat>;
}
const StatsScreen: React.FC<StatsScreenProps> = ({ userSettings, onNavigate, learnedWordsHistory, quizHistory, allWords, wordStats }) => {
    const totalWordsLearnedOverall = learnedWordsHistory.reduce((sum, item) => sum + item.count, 0);
    const averageQuizScore = quizHistory.length > 0 
        ? (quizHistory.reduce((sum, item) => sum + (item.score / Math.max(1, item.total)), 0) / quizHistory.length) * 100
        : 0;

    const getWordStat = useCallback((wordId: string | number) => {
        return wordStats[wordId] || getDefaultWordStat(wordId);
    }, [wordStats]);

    const masteredWordsCount = Object.values(wordStats).filter(stat => stat.isMastered).length;

    const wordsToReview = useMemo(() => {
        return allWords
            .map(word => ({ ...word, stat: getWordStat(word.id) }))
            .filter(word => word.stat.quizIncorrectCount > 0 && !word.stat.isMastered && word.gradeLevel === userSettings.grade) 
            .sort((a, b) => b.stat.quizIncorrectCount - a.stat.quizIncorrectCount)
            .slice(0, 5);
    }, [allWords, wordStats, userSettings.grade, getWordStat]);


    return (
        <div className="p-4 sm:p-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-400 mb-6">학습 통계</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-slate-700 p-6 rounded-lg shadow-lg">
                    <h2 className="text-xl font-semibold text-cyan-300 mb-2">총 학습 단어 (역대)</h2>
                    <p className="text-3xl font-bold text-white">{totalWordsLearnedOverall}개</p>
                </div>
                 <div className="bg-slate-700 p-6 rounded-lg shadow-lg">
                    <h2 className="text-xl font-semibold text-cyan-300 mb-2">완료한 단어</h2>
                    <p className="text-3xl font-bold text-white">{masteredWordsCount}개</p>
                </div>
                <div className="bg-slate-700 p-6 rounded-lg shadow-lg">
                    <h2 className="text-xl font-semibold text-cyan-300 mb-2">평균 퀴즈 점수</h2>
                    <p className="text-3xl font-bold text-white">{averageQuizScore.toFixed(1)}%</p>
                    <p className="text-sm text-slate-400">{quizHistory.length}회 응시</p>
                </div>
            </div>

            {wordsToReview.length > 0 && (
                 <div className="mb-8">
                    <h3 className="text-xl font-semibold text-cyan-300 mb-3">집중 복습 추천 단어 (현재 학년)</h3>
                    <ul className="space-y-2 bg-slate-700 p-3 rounded-md">
                        {wordsToReview.map(word => (
                            <li key={word.id} className="flex justify-between p-2 bg-slate-600 rounded items-center">
                                <div>
                                    <span className="text-cyan-300 font-semibold">{word.term}</span>
                                    <span className="text-slate-400 text-sm ml-2">- {word.meaning}</span>
                                </div>
                                <span className="text-red-400 text-sm">오답 {word.stat.quizIncorrectCount}회</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h3 className="text-xl font-semibold text-cyan-300 mb-3">일일 학습 기록</h3>
                    {learnedWordsHistory.length > 0 ? (
                        <ul className="space-y-2 max-h-60 overflow-y-auto bg-slate-700 p-3 rounded-md">
                            {learnedWordsHistory.slice().reverse().map((item, index) => (
                                <li key={index} className="flex justify-between p-2 bg-slate-600 rounded">
                                    <span className="text-slate-300">{item.date}</span>
                                    <span className="text-white font-semibold">{item.count} 단어</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-slate-400">아직 학습 기록이 없습니다.</p>
                    )}
                </div>

                <div>
                    <h3 className="text-xl font-semibold text-cyan-300 mb-3">퀴즈 기록</h3>
                    {quizHistory.length > 0 ? (
                        <ul className="space-y-2 max-h-60 overflow-y-auto bg-slate-700 p-3 rounded-md">
                            {quizHistory.slice().reverse().map((item, index) => (
                                <li key={index} className="flex justify-between p-2 bg-slate-600 rounded">
                                    <span className="text-slate-300">{item.date}</span>
                                    <span className="text-white font-semibold">{item.score} / {item.total}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-slate-400">아직 퀴즈 기록이 없습니다.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

// ManageWords Screen Component
interface ManageWordsScreenProps extends ScreenProps {
    myWords: Word[];
    allWords: Word[]; 
    wordStats: Record<string | number, WordStat>;
    onSaveCustomWord: (wordData: Partial<Word>, gradeLevelForNew?: string) => Promise<boolean>;
    onDeleteCustomWord: (wordId: number | string) => void;
    updateWordStat: (wordId: string | number, newStat: Partial<Omit<WordStat, 'id'>>) => void; 
}

const ManageWordsScreen: React.FC<ManageWordsScreenProps> = ({ userSettings, onNavigate, myWords, allWords, wordStats, onSaveCustomWord, onDeleteCustomWord, updateWordStat, addToast, setGlobalLoading }) => {
    type ManageTab = 'myWordsManage' | 'addManual' | 'fileExtract';
    const [activeTab, setActiveTab] = useState<ManageTab>('myWordsManage');
    
    const [newWordData, setNewWordData] = useState<Partial<Word>>({ term: '', meaning: '', partOfSpeech: '', exampleSentence: '', exampleSentenceMeaning: '', pronunciation: '' });
    const [isSubmittingManualAdd, setIsSubmittingManualAdd] = useState(false);

    const [extractedText, setExtractedText] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isLoadingFile, setIsLoadingFile] = useState(false); 
    const [isProcessingFileWords, setIsProcessingFileWords] = useState(false); 
    const [processingLog, setProcessingLog] = useState<string[]>([]);
    const processingLogRef = useRef<HTMLDivElement>(null);
    
    const [editingWord, setEditingWord] = useState<Word | null>(null);
    const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
    const [wordToDelete, setWordToDelete] = useState<Word | null>(null);

    const [fileSummary, setFileSummary] = useState<string | null>(null);
    const [isFetchingSummary, setIsFetchingSummary] = useState(false);

    useEffect(() => {
        if (processingLogRef.current) {
            processingLogRef.current.scrollTop = processingLogRef.current.scrollHeight;
        }
    }, [processingLog]);

    const extractUniqueNewWords = useCallback((text: string): string[] => {
        const existingTerms = new Set(allWords.map(w => w.term.toLowerCase()));
        const words = text
            .toLowerCase()
            .match(/\b[a-z]{3,}\b/g)
            ?.filter(extractedWord => !existingTerms.has(extractedWord)); 
        if (words) {
            return Array.from(new Set(words)).sort();
        }
        return [];
    }, [allWords]);

    const handleGenerateFileSummary = async () => {
        if (!extractedText || !process.env.API_KEY) {
            addToast(process.env.API_KEY ? "요약할 추출된 텍스트가 없습니다." : "AI 요약 기능을 위해 API 키를 설정해주세요.", "warning");
            return;
        }
         if (isCurrentlyGeminiQuotaExhausted) {
             addToast("Gemini API 할당량이 소진되어 AI 텍스트 요약을 할 수 없습니다.", "warning");
             return;
        }
        setIsFetchingSummary(true);
        const summary = await generateSummaryWithGemini(extractedText, addToast, setGlobalLoading);
        setFileSummary(summary);
        setIsFetchingSummary(false);
        if (summary) {
            addToast("텍스트 요약이 생성되었습니다.", "success");
        } else {
            // Error toast handled by generateSummaryWithGemini or quota check
        }
    };


    const processAndAddExtractedWords = async (wordsToProcess: string[]) => {
        if (!process.env.API_KEY) {
            addToast("파일에서 단어 자동 추가 기능을 사용하려면 API 키가 필요합니다.", "error");
            setProcessingLog(prev => [...prev, "오류: API 키가 설정되지 않았습니다. 자동 추가를 중단합니다."]);
            setIsProcessingFileWords(false);
            return;
        }
        if (isCurrentlyGeminiQuotaExhausted) {
            addToast("Gemini API 할당량이 소진되어 단어 자동 추가를 시작할 수 없습니다. 잠시 후 다시 시도해주세요.", "error");
            setProcessingLog(prev => [...prev, "오류: Gemini API 할당량 소진됨. 자동 추가 중단."]);
            setIsProcessingFileWords(false);
            return;
        }

        setIsProcessingFileWords(true);
        // Do not setGlobalLoading(true) here; onSaveCustomWord handles its own loading.
        setProcessingLog(prev => [...prev, `총 ${wordsToProcess.length}개의 새로운 단어 자동 처리 시작... (각 단어 처리 시 약간의 지연이 있을 수 있습니다)`]);
        let successCount = 0;
        let failCount = 0;
        const delayBetweenCalls = 6000; 

        for (let i = 0; i < wordsToProcess.length; i++) {
            if (isCurrentlyGeminiQuotaExhausted) { 
                addToast("Gemini API 할당량이 처리 도중 소진되었습니다. 나머지 단어 처리를 중단합니다.", "error");
                setProcessingLog(prev => [...prev, `API 할당량 소진으로 '${wordsToProcess[i]}' 이후 단어 처리 중단.`]);
                failCount += (wordsToProcess.length - i); 
                break; 
            }

            const term = wordsToProcess[i];
            setProcessingLog(prev => [...prev, `(${i + 1}/${wordsToProcess.length}) '${term}' 처리 중... AI 정보 요청...`]);
            
            const added = await onSaveCustomWord({ term }, userSettings.grade); 
            
            if (added) {
                successCount++;
                setProcessingLog(prev => [...prev, `✅ '${term}' 추가 완료.`]);
            } else {
                failCount++;
                setProcessingLog(prev => [...prev, `❌ '${term}' 추가 실패. (AI 정보 부족, 중복 또는 API 오류 - 상세 내용은 개별 알림/토스트 확인)`]);
            }

            if (i < wordsToProcess.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenCalls));
            }
        }

        setProcessingLog(prev => [...prev, `--- 모든 단어 처리 완료 ---`]);
        setProcessingLog(prev => [...prev, `최종 결과: 성공 ${successCount}개, 실패 ${failCount}개.`]);
        addToast(`파일 단어 처리 완료: 성공 ${successCount}, 실패 ${failCount}`, failCount > 0 ? "warning" : "success");
        setIsProcessingFileWords(false);
        // Do not setGlobalLoading(false) here.
    };


    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsLoadingFile(true);
        setIsProcessingFileWords(false); 
        setExtractedText('');
        setProcessingLog([]); 
        setFileSummary(null);
        setProcessingLog(prev => [...prev, `파일 선택됨: '${file.name}' (타입: ${file.type || '알 수 없음'}). 분석 중...`]);


        try {
            let textContentFromFile = "";
            if (file.type === "application/pdf") {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    textContentFromFile += textContent.items.map(item => ('str' in item ? item.str : '')).join(" ") + "\n";
                }
            } else if (file.type === "text/plain") {
                textContentFromFile = await file.text();
            } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
                 const data = await file.arrayBuffer();
                 const workbook = XLSX.read(data);
                 const sheetName = workbook.SheetNames[0];
                 const worksheet = workbook.Sheets[sheetName];
                 const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });
                 jsonData.forEach(row => {
                     if (Array.isArray(row)) textContentFromFile += row.join(" ") + "\n";
                 });
            } else {
                addToast("지원하지 않는 파일 형식입니다. PDF, TXT, XLSX, CSV 파일만 지원됩니다.", "error");
                setProcessingLog(prev => [...prev, "지원하지 않는 파일 형식입니다. PDF, TXT, XLSX, CSV 파일만 지원됩니다."]);
                setIsLoadingFile(false);
                if (fileInputRef.current) fileInputRef.current.value = ""; 
                return;
            }
            setExtractedText(textContentFromFile);
            addToast("파일 분석 완료. 내용을 확인하고 요약 또는 단어 추가를 진행하세요.", "success");
            setProcessingLog(prev => [...prev, "파일 분석 완료. 고유 단어 추출 및 추가 준비 완료."]);

        } catch (error) {
            console.error("Error processing file:", error);
            const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류';
            addToast(`파일 처리 중 오류 발생: ${errorMsg}`, "error");
            setProcessingLog(prev => [...prev, `파일 처리 오류: ${errorMsg}`]);
        } finally {
            setIsLoadingFile(false);
            if (fileInputRef.current) fileInputRef.current.value = ""; 
        }
    };
    
    const handleStartWordProcessingFromFile = () => {
        if (!extractedText) {
            addToast("먼저 파일을 업로드하고 분석해주세요.", "warning");
            return;
        }
        const uniqueNewWords = extractUniqueNewWords(extractedText);
        if (uniqueNewWords.length > 0) {
             if (!process.env.API_KEY) {
                addToast("단어 자동 추가를 위해 API 키가 필요합니다. 환경 변수를 확인해주세요.", "error");
                setProcessingLog(prev => [...prev, "API 키가 없어 자동 추가를 진행할 수 없습니다. 추출된 단어는 다음과 같습니다: " + uniqueNewWords.join(', ')]);
             } else if (isCurrentlyGeminiQuotaExhausted) {
                 addToast("Gemini API 할당량이 소진되어 단어 자동 추가를 할 수 없습니다.", "warning");
             } else {
                processAndAddExtractedWords(uniqueNewWords);
             }
        } else {
            addToast("파일에서 새로운 단어를 찾지 못했습니다 (이미 목록에 있거나 3글자 미만일 수 있음).", "info");
            setProcessingLog(prev => [...prev, "파일에서 새로운 단어를 찾지 못했습니다."]);
        }
    };

    const handleManualAddInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setNewWordData(prev => ({ ...prev, [name]: value }));
    };

    const handleManualAddWord = async () => {
        const { term, meaning, partOfSpeech, exampleSentence } = newWordData;
        if (!term?.trim() || !meaning?.trim() || !partOfSpeech?.trim() || !exampleSentence?.trim()) {
            addToast("단어, 뜻, 품사, 예문은 필수 항목입니다. 모두 채워주세요.", "warning");
            return;
        }

        setIsSubmittingManualAdd(true);
        const success = await onSaveCustomWord(newWordData, userSettings.grade);
        setIsSubmittingManualAdd(false);
        if (success) {
            setNewWordData({ term: '', meaning: '', partOfSpeech: '', exampleSentence: '', exampleSentenceMeaning: '', pronunciation: '' }); 
        }
    };

    const handleFetchWithAIForManualAdd = async () => {
        if (!newWordData.term?.trim() || !process.env.API_KEY) {
             addToast(process.env.API_KEY ? "AI로 정보를 가져올 단어를 입력해주세요." : "AI 정보 채우기를 위해 API 키를 설정해주세요.", "warning");
            return;
        }
         if (isCurrentlyGeminiQuotaExhausted) {
             addToast("Gemini API 할당량이 소진되어 AI 정보 채우기를 할 수 없습니다.", "warning");
             return;
        }
        setIsSubmittingManualAdd(true);
        const details = await generateWordDetailsWithGemini(newWordData.term.trim(), addToast, setGlobalLoading);
        if (details) {
            setNewWordData(prev => ({
                ...prev,
                term: details.term || prev.term,
                meaning: details.meaning || '',
                partOfSpeech: details.partOfSpeech || '',
                exampleSentence: details.exampleSentence || '',
                exampleSentenceMeaning: details.exampleSentenceMeaning || '',
                pronunciation: details.pronunciation || '',
            }));
        }
        setIsSubmittingManualAdd(false);
    };

    const handleEditMyWord = (word: Word) => {
        setEditingWord(JSON.parse(JSON.stringify(word))); 
    };
    
    const handleSaveMyWordEdit = async (updatedWord: Word) => {
        const { term, meaning, partOfSpeech, exampleSentence } = updatedWord;
        if (!term?.trim() || !meaning?.trim() || !partOfSpeech?.trim() || !exampleSentence?.trim()) {
            addToast("단어, 뜻, 품사, 예문은 필수 항목입니다. 모두 채워주세요.", "warning");
            return; // Do not proceed if validation fails
        }
        setIsSubmittingManualAdd(true); 
        const success = await onSaveCustomWord(updatedWord);
        setIsSubmittingManualAdd(false);
        if (success) {
            setEditingWord(null); 
        }
    };

    const handleDeleteMyWordClick = (word: Word) => {
        setWordToDelete(word);
        setShowConfirmDeleteModal(true);
    };

    const confirmDeleteMyWord = () => {
        if(wordToDelete) {
            onDeleteCustomWord(wordToDelete.id);
        }
        setShowConfirmDeleteModal(false);
        setWordToDelete(null);
    };


    const tabs: { id: ManageTab; label: string }[] = [
        { id: 'myWordsManage', label: '나의 단어 관리' },
        { id: 'addManual', label: '단어 직접 추가' },
        { id: 'fileExtract', label: '파일에서 추출 및 자동 추가' },
    ];
    
    return (
        <div className="p-4 sm:p-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-400 mb-6">단어 관리</h1>
            <div className="mb-6 border-b border-slate-700">
                <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`${
                                activeTab === tab.id
                                    ? 'border-cyan-500 text-cyan-400'
                                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-500'
                            } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm sm:text-base`}
                            aria-current={activeTab === tab.id ? 'page' : undefined}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {activeTab === 'myWordsManage' && (
                <div>
                    <h2 className="text-xl font-semibold text-cyan-300 mb-4">나의 단어 목록 ({myWords.length}개)</h2>
                    {myWords.length > 0 ? (
                        <ul className="space-y-3">
                            {myWords.map((word) => (
                                <li key={word.id} className="p-4 bg-slate-700 rounded-lg shadow">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <h4 className="font-semibold text-lg text-cyan-400">{word.term}</h4>
                                            <p className="text-sm text-slate-300 mt-1">
                                                {word.meaning ? word.meaning : <span className="text-slate-500 italic">(뜻 없음)</span>}
                                                {word.partOfSpeech && <span className="text-xs text-slate-400 ml-2">({word.partOfSpeech})</span>}
                                            </p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 items-center flex-shrink-0 ml-2">
                                            <button 
                                                onClick={() => speak(word.term)} 
                                                className="text-slate-400 hover:text-cyan-400 text-xl p-1.5 rounded-md hover:bg-slate-500" 
                                                aria-label={`${word.term} 발음 듣기`}
                                            >
                                                🔊
                                            </button>
                                            <button
                                                onClick={() => handleEditMyWord(word)}
                                                aria-label={`${word.term} 수정`}
                                                className="px-3 py-1.5 bg-yellow-500 text-slate-900 rounded-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-opacity-75 text-sm whitespace-nowrap"
                                            >
                                                ✏️ 수정
                                            </button>
                                            <button
                                                onClick={() => handleDeleteMyWordClick(word)}
                                                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-75 text-sm whitespace-nowrap"
                                                aria-label={`${word.term} 삭제`}
                                            >
                                                🗑️ 삭제
                                            </button>
                                        </div>
                                    </div>
                                     {word.exampleSentence && (
                                        <details className="mt-2 text-sm">
                                            <summary className="cursor-pointer text-slate-400 hover:text-slate-200">예문 보기</summary>
                                            <div className="mt-1 p-2 bg-slate-600 rounded">
                                                <p className="text-slate-200">{word.exampleSentence}</p>
                                                {word.exampleSentenceMeaning && <p className="text-slate-400 text-xs mt-0.5">{word.exampleSentenceMeaning}</p>}
                                            </div>
                                        </details>
                                    )}
                                </li>
                            ))}
                        </ul>
                    ) : (
                         <p className="text-center text-slate-400 py-6">아직 추가한 단어가 없습니다. '단어 직접 추가' 탭이나 '파일에서 추출' 탭에서 단어를 추가해보세요.</p>
                    )}
                </div>
            )}
            
            {activeTab === 'addManual' && (
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold text-cyan-300 mb-2">단어 직접 추가</h2>
                    <input type="text" name="term" placeholder="단어 (필수)" value={newWordData.term || ''} onChange={handleManualAddInputChange} className="w-full p-3 bg-slate-700 rounded border border-slate-600" />
                    <button
                        type="button"
                        onClick={handleFetchWithAIForManualAdd}
                        disabled={isSubmittingManualAdd || !process.env.API_KEY || !newWordData.term?.trim() || isCurrentlyGeminiQuotaExhausted}
                        className="w-full py-2 px-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-md shadow-sm disabled:opacity-50 flex items-center justify-center text-sm"
                    >
                        <span role="img" aria-label="ai" className="mr-2">✨</span>
                        {isSubmittingManualAdd && newWordData.term ? 'AI 정보 가져오는 중...' : 'AI로 나머지 정보 채우기'}
                        {(!process.env.API_KEY || !newWordData.term?.trim() || isCurrentlyGeminiQuotaExhausted) && <span className="text-xs ml-1">({!newWordData.term?.trim() ? "단어 입력 필요": (!process.env.API_KEY ? "API Key 필요" : "Quota 소진")})</span>}
                    </button>
                    <input type="text" name="meaning" placeholder="뜻 (필수)" value={newWordData.meaning || ''} onChange={handleManualAddInputChange} className="w-full p-3 bg-slate-700 rounded border border-slate-600" />
                    <input type="text" name="partOfSpeech" placeholder="품사 (필수)" value={newWordData.partOfSpeech || ''} onChange={handleManualAddInputChange} className="w-full p-3 bg-slate-700 rounded border border-slate-600" />
                    <input type="text" name="pronunciation" placeholder="발음기호 (선택)" value={newWordData.pronunciation || ''} onChange={handleManualAddInputChange} className="w-full p-3 bg-slate-700 rounded border border-slate-600" />
                    <textarea name="exampleSentence" placeholder="예문 (필수)" value={newWordData.exampleSentence || ''} onChange={handleManualAddInputChange} className="w-full p-3 bg-slate-700 rounded border border-slate-600" rows={2}></textarea>
                    <textarea name="exampleSentenceMeaning" placeholder="예문 뜻 (선택)" value={newWordData.exampleSentenceMeaning || ''} onChange={handleManualAddInputChange} className="w-full p-3 bg-slate-700 rounded border border-slate-600" rows={2}></textarea>
                    
                    <button onClick={handleManualAddWord} disabled={isSubmittingManualAdd || !newWordData.term?.trim() || !newWordData.meaning?.trim() || !newWordData.partOfSpeech?.trim() || !newWordData.exampleSentence?.trim() } className="w-full py-3 px-4 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-md shadow disabled:opacity-50">
                        {isSubmittingManualAdd ? '추가 중...' : '단어 추가하기'}
                    </button>
                </div>
            )}

            {activeTab === 'fileExtract' && (
                <div className="space-y-4">
                     <h2 className="text-xl font-semibold text-cyan-300 mb-2">파일에서 단어 추출 및 자동 추가</h2>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        accept=".pdf,.txt,.xlsx,.xls,.csv" 
                        className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100 disabled:opacity-50 disabled:cursor-not-allowed" 
                        disabled={isLoadingFile || isProcessingFileWords}
                    />
                    
                    {isLoadingFile && <p className="text-cyan-400 text-center">파일 분석 중...</p>}
                    
                    {extractedText && !isProcessingFileWords && (
                        <div className="mt-4 p-4 bg-slate-700 rounded-md max-h-60 overflow-y-auto">
                            <h4 className="font-semibold text-cyan-300 mb-2">추출된 텍스트 ({extractUniqueNewWords(extractedText).length}개의 새 단어 후보):</h4>
                            <p className="text-xs text-slate-300 whitespace-pre-wrap">{extractedText.substring(0,1000)}{extractedText.length > 1000 ? '...' : ''}</p>
                        </div>
                    )}

                    {extractedText && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                             <button 
                                onClick={handleGenerateFileSummary} 
                                className="w-full py-2 px-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-md shadow-sm disabled:opacity-50 flex items-center justify-center"
                                disabled={isLoadingFile || isProcessingFileWords || isFetchingSummary || !process.env.API_KEY || isCurrentlyGeminiQuotaExhausted}
                            >
                                <span role="img" aria-label="summarize" className="mr-2">📄</span>
                                {isFetchingSummary ? 'AI 요약 생성 중...' : 'AI: 텍스트 요약 보기'}
                                {(!process.env.API_KEY || isCurrentlyGeminiQuotaExhausted) && <span className="text-xs ml-1">({!process.env.API_KEY ? "Key 필요" : "Quota 소진"})</span>}
                            </button>
                            <button 
                                onClick={handleStartWordProcessingFromFile} 
                                className="w-full py-2 px-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-md shadow-sm disabled:opacity-50"
                                disabled={isLoadingFile || isProcessingFileWords || !process.env.API_KEY || isCurrentlyGeminiQuotaExhausted || extractUniqueNewWords(extractedText).length === 0}
                            >
                                <span role="img" aria-label="add words" className="mr-2">➕</span>
                                {isProcessingFileWords ? '단어 추가 처리 중...' : `AI로 새 단어 자동 추가 (${extractUniqueNewWords(extractedText).length}개)`}
                                {(!process.env.API_KEY || isCurrentlyGeminiQuotaExhausted) && <span className="text-xs ml-1">({!process.env.API_KEY ? "Key 필요" : "Quota 소진"})</span>}
                            </button>
                        </div>
                    )}
                    
                    {fileSummary && (
                        <div className="mt-3 p-3 bg-slate-600 rounded-md animate-fadeIn">
                             <h4 className="font-semibold text-teal-300 mb-1">AI 텍스트 요약:</h4>
                             <p className="text-sm text-slate-200 whitespace-pre-wrap">{fileSummary}</p>
                        </div>
                    )}

                    {processingLog.length > 0 && (
                        <div ref={processingLogRef} className="mt-4 p-3 bg-slate-700 rounded-md max-h-48 overflow-y-auto">
                            <h4 className="font-semibold text-cyan-300 mb-2">처리 로그:</h4>
                            {processingLog.map((log, index) => (
                                <p key={index} className={`text-xs ${log.startsWith('❌') ? 'text-red-400' : (log.startsWith('✅') ? 'text-green-400' : 'text-slate-300')}`}>{log}</p>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {editingWord && activeTab === 'myWordsManage' && <EditWordModal word={editingWord} onSave={handleSaveMyWordEdit} onCancel={() => setEditingWord(null)} userGrade={userSettings.grade} isCustomWordOnly={true} addToast={addToast} setGlobalLoading={setGlobalLoading} />}
            {wordToDelete && activeTab === 'myWordsManage' && (
                <ConfirmationModal
                    isOpen={showConfirmDeleteModal}
                    title="단어 삭제 확인"
                    message={`'${wordToDelete.term}' 단어를 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
                    onConfirm={confirmDeleteMyWord}
                    onCancel={() => { setShowConfirmDeleteModal(false); setWordToDelete(null); }}
                />
            )}
        </div>
    );
};


// Main App Component
const App = (): React.ReactElement => {
    const { addToast } = useToasts();
    const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
    const [currentScreen, setCurrentScreen] = useState<AppScreen>('loginSetup');
    const [screenParams, setScreenParams] = useState<any>(null);
    const [isGlobalLoading, setGlobalLoading] = useState<boolean>(false);
    
    // Word data state
    const [myWords, setMyWords] = useState<Word[]>(() => {
        try {
            const savedWords = localStorage.getItem('myWords');
            return savedWords ? JSON.parse(savedWords) : [];
        } catch (e) {
            console.error("Failed to parse myWords from localStorage:", e);
            localStorage.removeItem('myWords');
            return [];
        }
    });
    const [allWords, setAllWords] = useState<Word[]>([]); 
    
    const [wordStats, setWordStats] = useState<Record<string | number, WordStat>>(() => {
        try {
            const savedStats = localStorage.getItem('wordStats');
            return savedStats ? JSON.parse(savedStats) : {};
        } catch (e) {
            console.error("Failed to parse wordStats from localStorage:", e);
            localStorage.removeItem('wordStats');
            return {};
        }
    });

    // History state
    const [learnedWordsHistory, setLearnedWordsHistory] = useState<{ date: string; count: number }[]>(() => {
        try {
            const savedHistory = localStorage.getItem('learnedWordsHistory');
            return savedHistory ? JSON.parse(savedHistory) : [];
        } catch (e) {
            console.error("Failed to parse learnedWordsHistory from localStorage:", e);
            localStorage.removeItem('learnedWordsHistory');
            return [];
        }
    });
    const [quizHistory, setQuizHistory] = useState<{ date: string; score: number; total: number }[]>(() => {
        try {
            const savedHistory = localStorage.getItem('quizHistory');
            return savedHistory ? JSON.parse(savedHistory) : [];
        } catch (e) {
            console.error("Failed to parse quizHistory from localStorage:", e);
            localStorage.removeItem('quizHistory');
            return [];
        }
    });
    
    const [isEditSettingsModalOpen, setIsEditSettingsModalOpen] = useState(false);


    // --- Data Persistence Effects ---
    useEffect(() => {
        try {
            localStorage.setItem('myWords', JSON.stringify(myWords));
        } catch (e) {
            console.error("Failed to save myWords to localStorage:", e);
            addToast("커스텀 단어 저장에 실패했습니다. (localStorage 오류)", "error");
        }
    }, [myWords, addToast]);
    
    useEffect(() => {
        try {
            localStorage.setItem('wordStats', JSON.stringify(wordStats));
        } catch (e) {
            console.error("Failed to save wordStats to localStorage:", e);
            addToast("단어 통계 저장에 실패했습니다. (localStorage 오류)", "error");
        }
    }, [wordStats, addToast]);
    
    useEffect(() => {
        try {
            localStorage.setItem('learnedWordsHistory', JSON.stringify(learnedWordsHistory));
        } catch (e) {
            console.error("Failed to save learnedWordsHistory to localStorage:", e);
             addToast("학습 이력 저장에 실패했습니다. (localStorage 오류)", "error");
        }
    }, [learnedWordsHistory, addToast]);

    useEffect(() => {
        try {
            localStorage.setItem('quizHistory', JSON.stringify(quizHistory));
        } catch (e) {
            console.error("Failed to save quizHistory to localStorage:", e);
            addToast("퀴즈 이력 저장에 실패했습니다. (localStorage 오류)", "error");
        }
    }, [quizHistory, addToast]);
    
    useEffect(() => {
        if (userSettings) {
             try {
                localStorage.setItem('userSettings', JSON.stringify(userSettings));
            } catch (e) {
                console.error("Failed to save userSettings to localStorage:", e);
                addToast("사용자 설정 저장에 실패했습니다. (localStorage 오류)", "error");
            }
        }
    }, [userSettings, addToast]);

    // Initialize allWords (sample + myWords)
    useEffect(() => {
        setAllWords([...sampleWords, ...myWords]);
    }, [myWords]);


    // Initial Load Settings
    useEffect(() => {
        try {
            const savedSettings = localStorage.getItem('userSettings');
            if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                setUserSettings(parsedSettings);
                setCurrentScreen('dashboard');
            } else {
                setCurrentScreen('loginSetup');
            }
        } catch (e) {
            console.error("Failed to parse userSettings from localStorage:", e);
            localStorage.removeItem('userSettings');
            setCurrentScreen('loginSetup');
        }
    }, []);

    // --- Navigation ---
    const handleNavigate = (screen: AppScreen, params: any = null) => {
        setCurrentScreen(screen);
        setScreenParams(params);
    };

    // --- User Settings Management ---
    const handleSetupComplete = (settings: UserSettings) => {
        setUserSettings(settings);
        setCurrentScreen('dashboard');
        addToast(`설정 완료! ${settings.username}님, 환영합니다!`, "success");
    };

    const handleSaveSettings = (newSettings: UserSettings) => {
        setUserSettings(newSettings);
        setIsEditSettingsModalOpen(false);
        addToast("설정이 성공적으로 저장되었습니다.", "success");
    };
    
    // --- Word Management ---
    const handleSaveCustomWord = async (wordData: Partial<Word>, gradeLevelForNew: string = userSettings?.grade || 'middle1'): Promise<boolean> => {
        setGlobalLoading(true);
        try {
            const existingWordIndex = myWords.findIndex(w => w.id === wordData.id);
            const isEditing = existingWordIndex !== -1;
            const existingAllWordIndex = allWords.findIndex(w => w.term.toLowerCase() === wordData.term?.toLowerCase() && w.id !== wordData.id);

            if (!wordData.term?.trim()) {
                addToast("단어는 비워둘 수 없습니다.", "warning");
                return false;
            }
             if (existingAllWordIndex !== -1 && (!isEditing || allWords[existingAllWordIndex].id !== wordData.id)) {
                addToast(`"${wordData.term}" 단어는 이미 전체 목록에 존재합니다. 다른 단어를 사용해주세요.`, "warning");
                return false;
            }

            let finalWordData: Word;

            if (isEditing) { // Editing an existing custom word
                if (!wordData.meaning?.trim() || !wordData.partOfSpeech?.trim() || !wordData.exampleSentence?.trim()) {
                     addToast("단어 수정 시 뜻, 품사, 예문은 필수 항목입니다.", "warning");
                     return false;
                }
                finalWordData = { ...myWords[existingWordIndex], ...wordData } as Word;
                setMyWords(prev => prev.map(w => w.id === finalWordData.id ? finalWordData : w));
                addToast(`'${finalWordData.term}' 단어가 수정되었습니다.`, "success");
            } else { // Adding a new word
                 const { term, pronunciation, partOfSpeech, meaning, exampleSentence, exampleSentenceMeaning } = wordData;
                
                let fetchedDetails: Partial<Word> | null = null;
                if (!meaning?.trim() || !partOfSpeech?.trim() || !exampleSentence?.trim()) { // If any core detail is missing, try to fetch from AI
                    if (!process.env.API_KEY || isCurrentlyGeminiQuotaExhausted) {
                         addToast(`신규 단어 '${term}' 추가 시 AI 정보 조회가 필요하나, ${!process.env.API_KEY ? "API 키가 없거나 " : ""} 할당량 문제로 진행할 수 없습니다. 필수 정보를 모두 직접 입력해주세요.`, "warning");
                         return false;
                    }
                    addToast(`'${term}'에 대한 정보가 부족하여 AI로 자동 완성 중...`, "info");
                    fetchedDetails = await generateWordDetailsWithGemini(term as string, addToast, setGlobalLoading); 
                    if (!fetchedDetails || !fetchedDetails.meaning?.trim() || !fetchedDetails.partOfSpeech?.trim() || !fetchedDetails.exampleSentence?.trim()) {
                        addToast(`AI가 '${term}'에 대한 충분한 정보를 제공하지 못했습니다. 수동으로 정보를 완성해주세요. 저장 실패.`, "error");
                        return false;
                    }
                }
                
                finalWordData = {
                    id: Date.now().toString(), // Simple unique ID for custom words
                    term: fetchedDetails?.term?.trim() || term?.trim() || "N/A",
                    pronunciation: fetchedDetails?.pronunciation || pronunciation,
                    partOfSpeech: fetchedDetails?.partOfSpeech?.trim() || partOfSpeech?.trim() || "N/A",
                    meaning: fetchedDetails?.meaning?.trim() || meaning?.trim() || "N/A",
                    exampleSentence: fetchedDetails?.exampleSentence?.trim() || exampleSentence?.trim() || "N/A",
                    exampleSentenceMeaning: fetchedDetails?.exampleSentenceMeaning || exampleSentenceMeaning,
                    gradeLevel: wordData.gradeLevel || gradeLevelForNew,
                    isCustom: true,
                };
                 if (!finalWordData.term || !finalWordData.meaning || !finalWordData.partOfSpeech || !finalWordData.exampleSentence) {
                    addToast("단어, 뜻, 품사, 예문은 필수 항목입니다. AI 정보 조회 후에도 누락되었습니다.", "error");
                    return false;
                 }


                if (allWords.some(w => w.term.toLowerCase() === finalWordData.term.toLowerCase())) {
                     addToast(`"${finalWordData.term}" 단어는 이미 목록에 존재합니다. 다른 단어를 사용해주세요.`, "warning");
                     return false;
                }
                setMyWords(prev => [...prev, finalWordData]);
                addToast(`'${finalWordData.term}' 단어가 추가되었습니다.`, "success");
            }
             if (!wordStats[finalWordData.id]) {
                updateWordStat(finalWordData.id, getDefaultWordStat(finalWordData.id));
            }
            return true;

        } catch (error) {
            console.error("Error saving custom word:", error);
            addToast(`단어 저장 중 오류 발생: ${error instanceof Error ? error.message : "알 수 없는 오류"}`, "error");
            return false;
        } finally {
            setGlobalLoading(false);
        }
    };
    
    const handleDeleteCustomWord = (wordId: number | string) => {
        const wordToDelete = myWords.find(w => w.id === wordId);
        if (!wordToDelete) {
            addToast("삭제할 단어를 찾지 못했습니다.", "error");
            return;
        }
        setMyWords(prev => prev.filter(w => w.id !== wordId));
        setWordStats(prev => {
            const newStats = {...prev};
            delete newStats[wordId];
            return newStats;
        });
        addToast(`'${wordToDelete.term}' 단어가 삭제되었습니다.`, "success");
    };

    const updateWordStat = (wordId: string | number, newStatData: Partial<Omit<WordStat, 'id'>>) => {
        setWordStats(prev => ({
            ...prev,
            [wordId]: {
                ...(prev[wordId] || getDefaultWordStat(wordId)),
                ...newStatData,
                id: wordId 
            }
        }));
    };
    
    // --- Learning & Quiz Callbacks ---
    const handleWordLearned = (wordId: number | string, isQuickReview: boolean = false) => {
        const today = getTodayDateString();
        updateWordStat(wordId, { lastReviewed: new Date().toISOString() });

        if (!isQuickReview) {
            setLearnedWordsHistory(prev => {
                const todayEntryIndex = prev.findIndex(item => item.date === today);
                if (todayEntryIndex > -1) {
                    const updatedHistory = [...prev];
                    updatedHistory[todayEntryIndex] = { ...updatedHistory[todayEntryIndex], count: updatedHistory[todayEntryIndex].count + 1 };
                    return updatedHistory;
                } else {
                    return [...prev, { date: today, count: 1 }];
                }
            });
        }
    };

    const handleQuizComplete = (finalScore: number, totalQuestions: number, incorrectWordsFromQuiz: Word[]) => {
        const today = getTodayDateString();
        setQuizHistory(prev => [...prev, { date: today, score: finalScore, total: totalQuestions }]);
        addToast(`퀴즈 완료! ${totalQuestions} 문제 중 ${finalScore}개를 맞혔습니다.`, "success");
    };


    const learnedWordsTodayCount = useMemo(() => {
        const today = getTodayDateString();
        const todayHistory = learnedWordsHistory.find(item => item.date === today);
        return todayHistory ? todayHistory.count : 0;
    }, [learnedWordsHistory]);

    const totalWordsLearnedOverall = useMemo(() => {
         return learnedWordsHistory.reduce((sum, item) => sum + item.count, 0);
    }, [learnedWordsHistory]);


    // Render current screen
    const renderScreen = () => {
        if (!userSettings && currentScreen !== 'loginSetup') {
            return <LoginSetupScreen onNavigate={handleNavigate} onSetupComplete={handleSetupComplete} addToast={addToast} />;
        }
        
        const screenProps: ScreenProps = { 
            userSettings: userSettings!, 
            onNavigate: handleNavigate, 
            currentScreen, 
            setGlobalLoading,
            addToast,
            openSettingsModal: () => setIsEditSettingsModalOpen(true)
        };

        switch (currentScreen) {
            case 'loginSetup':
                return <LoginSetupScreen onNavigate={handleNavigate} onSetupComplete={handleSetupComplete} addToast={addToast} />;
            case 'dashboard':
                return <DashboardScreen {...screenProps} myWords={myWords} learnedWordsToday={learnedWordsTodayCount} totalWordsLearned={totalWordsLearnedOverall} />;
            case 'learnWords':
                return <LearnWordsScreen {...screenProps} words={allWords} wordStats={wordStats} onWordLearned={handleWordLearned} updateWordStat={updateWordStat} />;
            case 'quiz':
                return <QuizScreen {...screenProps} words={allWords} wordStats={wordStats} onQuizComplete={handleQuizComplete} updateWordStat={updateWordStat} />;
            case 'allWords':
                return <AllWordsScreen {...screenProps} allWords={allWords} wordStats={wordStats} onDeleteCustomWord={handleDeleteCustomWord} onSaveCustomWord={handleSaveCustomWord} updateWordStat={updateWordStat} />;
            case 'stats':
                return <StatsScreen {...screenProps} learnedWordsHistory={learnedWordsHistory} quizHistory={quizHistory} allWords={allWords} wordStats={wordStats} />;
            case 'manageWords':
                 return <ManageWordsScreen {...screenProps} myWords={myWords} allWords={allWords} wordStats={wordStats} onSaveCustomWord={handleSaveCustomWord} onDeleteCustomWord={handleDeleteCustomWord} updateWordStat={updateWordStat} />;
            default:
                return <LoginSetupScreen onNavigate={handleNavigate} onSetupComplete={handleSetupComplete} addToast={addToast} />;
        }
    };

    const { isDarkMode } = useTheme();

    return (
        <div className={`w-full h-full ${isDarkMode ? 'bg-slate-800' : 'bg-white'} transition-colors duration-300`}>
            {userSettings && <NavBar currentScreen={currentScreen} onNavigate={handleNavigate} userSettings={userSettings} onOpenSettings={() => setIsEditSettingsModalOpen(true)} />}
            <main className="flex-grow overflow-y-auto">
                {renderScreen()}
            </main>
            <GlobalSpinner isLoading={isGlobalLoading} />
            {userSettings && (
                <EditSettingsModal 
                    isOpen={isEditSettingsModalOpen}
                    currentSettings={userSettings}
                    onSave={handleSaveSettings}
                    onCancel={() => setIsEditSettingsModalOpen(false)}
                    addToast={addToast}
                />
            )}
        </div>
    );
};


// Mount the app
const container = document.getElementById('root');
if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(
        <React.StrictMode>
            <ThemeProvider>
                <SpeechProvider>
                    <ToastProvider>
                        <App />
                    </ToastProvider>
                </SpeechProvider>
            </ThemeProvider>
        </React.StrictMode>
    );
}
