import { defineStore } from 'pinia';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User
} from 'firebase/auth';
import { ref } from 'vue';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const initializing = ref(true);
  const authError = ref<string | null>(null);

  let unsubscribe: (() => void) | null = null;

  const initAuth = (): void => {
    if (!isFirebaseConfigured) {
      authError.value = 'Firebase is not configured. Authentication is disabled.';
      initializing.value = false;
      return;
    }

    if (unsubscribe) {
      return;
    }

    unsubscribe = onAuthStateChanged(
      getFirebaseAuth(),
      (nextUser) => {
        user.value = nextUser;
        authError.value = null;
        initializing.value = false;
      },
      (error) => {
        authError.value = error.message;
        initializing.value = false;
      }
    );
  };

  const registerWithEmail = async (email: string, password: string): Promise<void> => {
    authError.value = null;
    await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  };

  const signInWithEmail = async (email: string, password: string): Promise<void> => {
    authError.value = null;
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  };

  const signOutCurrentUser = async (): Promise<void> => {
    await signOut(getFirebaseAuth());
  };

  return {
    user,
    initializing,
    authError,
    initAuth,
    registerWithEmail,
    signInWithEmail,
    signOutCurrentUser
  };
});
