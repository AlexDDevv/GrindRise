import { apiRequest } from '../../lib/api';
import { STRENGTH_SPORT_ID } from '../strength/toWorkoutPayload';
import type { Program, ProgramWorkout } from './types';

/**
 * Les sept opérations de `ProgramsController`, une fonction chacune.
 *
 * Par l'API et non par Supabase en direct, alors qu'un programme n'a aucune
 * valeur de jeu et que la RLS autoriserait la lecture : le serveur porte ce que
 * la RLS ne sait pas exprimer — le rang contigu des jours, et le remplacement
 * atomique d'une liste d'exercices. Passer par les deux chemins selon
 * l'opération ferait diverger l'ordre affiché de l'ordre enregistré.
 *
 * Aucune n'attrape ses erreurs : `usePrograms` les traduit toutes au même
 * endroit, et une fonction qui avale un échec le rendrait invisible.
 */

/** Programmes de l'appelant, jours et exercices imbriqués et ordonnés. */
export function listPrograms(): Promise<Program[]> {
  return apiRequest<Program[]>('/programs');
}

/**
 * Un programme vide.
 *
 * `sportId` est toujours la musculation : c'est le seul sport à log structuré,
 * et le design fait de cette contrainte une règle de navigation — les
 * programmes ne s'atteignent que depuis le départ musculation.
 */
export function createProgram(name: string): Promise<Program> {
  return apiRequest<Program>('/programs', {
    method: 'POST',
    body: { sportId: STRENGTH_SPORT_ID, name },
  });
}

export function renameProgram(id: string, name: string): Promise<Program> {
  return apiRequest<Program>(`/programs/${id}`, { method: 'PATCH', body: { name } });
}

export function deleteProgram(id: string): Promise<void> {
  return apiRequest<void>(`/programs/${id}`, { method: 'DELETE' });
}

export function addWorkout(programId: string, name: string): Promise<ProgramWorkout> {
  return apiRequest<ProgramWorkout>(`/programs/${programId}/workouts`, {
    method: 'POST',
    body: { name },
  });
}

export function renameWorkout(id: string, name: string): Promise<ProgramWorkout> {
  return apiRequest<ProgramWorkout>(`/program-workouts/${id}`, {
    method: 'PATCH',
    body: { name },
  });
}

export function deleteWorkout(id: string): Promise<void> {
  return apiRequest<void>(`/program-workouts/${id}`, { method: 'DELETE' });
}

/**
 * Remplace toute la liste d'un jour, plutôt que d'ajouter ou de déplacer.
 *
 * C'est la forme qu'impose le serveur, et elle est la bonne : réordonner
 * devient l'envoi d'un tableau, les rangs sont réattribués d'un bloc, et aucun
 * état intermédiaire ne fait partager un rang à deux exercices. Une liste vide
 * est un remplacement valide — c'est ainsi qu'on vide un jour.
 */
export function replaceExercises(
  workoutId: string,
  exerciseIds: string[],
): Promise<unknown> {
  return apiRequest(`/program-workouts/${workoutId}/exercises`, {
    method: 'PUT',
    body: { exerciseIds },
  });
}
