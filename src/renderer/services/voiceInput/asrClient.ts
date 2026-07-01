import {
  AsrApiCode,
  AsrLangType,
} from '../../../shared/asr/constants';
import { buildVoiceInputFileName } from './constants';
import { AsrClientError, getFallbackAsrErrorMessage } from './errors';

type LegacyAsrRecognizeData = {
  text: string;
};

type LegacyAsrRecognizeResult = {
  success: boolean;
  data?: LegacyAsrRecognizeData;
  code?: number;
};

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

export const recognizeVoiceInput = async (wavBlob: Blob): Promise<LegacyAsrRecognizeData> => {
  const audioBase64 = await blobToBase64(wavBlob);
  const asrApi = window.electron.asr as typeof window.electron.asr & {
    recognize?: (payload: {
      audioBase64: string;
      fileName: string;
      langType: typeof AsrLangType[keyof typeof AsrLangType];
    }) => Promise<LegacyAsrRecognizeResult>;
  };
  if (!asrApi.recognize) {
    throw new AsrClientError(
      getFallbackAsrErrorMessage(AsrApiCode.RecognitionFailed),
      AsrApiCode.RecognitionFailed,
    );
  }
  const result = await asrApi.recognize({
    audioBase64,
    fileName: buildVoiceInputFileName(),
    // TODO: The current product is China-first. Revisit langType selection for international releases.
    langType: AsrLangType.ZhChs,
  });
  if (!result.success) {
    throw new AsrClientError(getFallbackAsrErrorMessage(result.code), result.code);
  }
  if (!result.data?.text.trim()) {
    throw new AsrClientError(getFallbackAsrErrorMessage(AsrApiCode.RecognitionFailed), AsrApiCode.RecognitionFailed);
  }
  return result.data;
};
