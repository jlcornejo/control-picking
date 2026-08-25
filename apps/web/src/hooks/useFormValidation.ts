import { useState, useCallback } from 'react';
import { z } from 'zod';

interface UseFormValidationOptions<T extends z.ZodObject<any>> {
  schema: T;
}

type FieldErrors = Record<string, string>;

export function useFormValidation<T extends z.ZodObject<any>>({ schema }: UseFormValidationOptions<T>) {
  const [errors, setErrors] = useState<FieldErrors>({});

  const validate = useCallback(
    (data: Record<string, unknown>): { success: true; data: z.infer<T> } | { success: false; errors: FieldErrors } => {
      const result = schema.safeParse(data);
      if (result.success) {
        setErrors({});
        return { success: true, data: result.data };
      }

      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        if (!fieldErrors[path]) {
          fieldErrors[path] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return { success: false, errors: fieldErrors };
    },
    [schema],
  );

  const clearErrors = useCallback(() => setErrors({}), []);
  const clearField = useCallback((field: string) => setErrors((prev) => { const next = { ...prev }; delete next[field]; return next; }), []);

  return { errors, validate, clearErrors, clearField };
}
