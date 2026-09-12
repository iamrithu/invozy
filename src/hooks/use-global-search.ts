import { useQuery } from '@tanstack/react-query';
import { globalSearch } from '@/actions/search';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

export function useGlobalSearch(term: string) {
  const debounced = useDebouncedValue(term.trim(), 200);
  return useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => globalSearch(debounced),
    enabled: debounced.length > 0,
    placeholderData: (prev) => prev,
  });
}
