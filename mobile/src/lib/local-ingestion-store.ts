import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDraftStore } from './ingestion-drafts';

export const ingestionDrafts = createDraftStore(AsyncStorage);
