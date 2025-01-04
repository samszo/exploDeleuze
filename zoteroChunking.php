<?php

class ZoteroChunker {
    private $chunkSize;

    public function __construct($chunkSize = 10) {
        $this->chunkSize = $chunkSize;
    }

    // Organise les références par type
    public function organizeByType(array $references): array {
        $organized = [];
        foreach ($references as $ref) {
            if (!isset($organized[$ref['type']])) {
                $organized[$ref['type']] = [];
            }
            $organized[$ref['type']][] = $ref;
        }
        return $organized;
    }

    // Organise les références par année
    public function organizeByYear(array $references): array {
        $organized = [];
        foreach ($references as $ref) {
            $year = $ref['issued']['date-parts'][0][0] ?? 'Unknown';
            if (!isset($organized[$year])) {
                $organized[$year] = [];
            }
            $organized[$year][] = $ref;
        }
        return $organized;
    }

    // Crée des chunks basés sur un critère spécifique
    public function createChunks(array $references, callable $criteriaFn = null): array {
        $chunks = [];
        $currentChunk = [];

        foreach ($references as $ref) {
            if ($criteriaFn && $criteriaFn($currentChunk, $ref)) {
                if (!empty($currentChunk)) {
                    $chunks[] = $currentChunk;
                    $currentChunk = [];
                }
            }

            if (count($currentChunk) >= $this->chunkSize) {
                $chunks[] = $currentChunk;
                $currentChunk = [];
            }

            $currentChunk[] = $ref;
        }

        if (!empty($currentChunk)) {
            $chunks[] = $currentChunk;
        }

        return $chunks;
    }

    // Formate un chunk en format standard
    public function formatChunk(array $chunk): array {
        return array_map(function($ref) {
            $authors = isset($ref['author']) ? array_map(function($author) {
                return $author['family'] . ', ' . $author['given'];
            }, $ref['author']) : [];

            return [
                'title' => $ref['title'] ?? '',
                'authors' => implode('; ', $authors),
                'year' => $ref['issued']['date-parts'][0][0] ?? null,
                'type' => $ref['type'] ?? '',
                'id' => $ref['id'] ?? ''
            ];
        }, $chunk);
    }

    // Analyse les thèmes communs dans un chunk
    public function analyzeThemes(array $chunk): array {
        $words = [];
        foreach ($chunk as $ref) {
            $title = strtolower($ref['title'] ?? '');
            foreach (str_word_count($title, 1) as $word) {
                if (strlen($word) > 3) {
                    $words[$word] = ($words[$word] ?? 0) + 1;
                }
            }
        }
        arsort($words);
        return array_slice($words, 0, 5, true);
    }

    // Crée des métadonnées pour le chunk
    public function createChunkMetadata(array $chunk): array {
        $years = array_map(function($ref) {
            return $ref['issued']['date-parts'][0][0] ?? null;
        }, $chunk);
        $years = array_filter($years);

        return [
            'size' => count($chunk),
            'dateRange' => [
                'start' => !empty($years) ? min($years) : null,
                'end' => !empty($years) ? max($years) : null
            ],
            'types' => array_unique(array_column($chunk, 'type')),
            'commonThemes' => $this->analyzeThemes($chunk)
        ];
    }

    // Traite l'ensemble de la bibliothèque
    public function processLibrary(array $references): array {
        $byType = $this->organizeByType($references);
        $processedChunks = [];

        foreach ($byType as $type => $refs) {
            $chunks = $this->createChunks($refs);
            foreach ($chunks as $chunk) {
                $processedChunks[] = [
                    'type' => $type,
                    'metadata' => $this->createChunkMetadata($chunk),
                    'references' => $this->formatChunk($chunk)
                ];
            }
        }

        return $processedChunks;
    }

    // Exemple de fonction utilitaire pour sauvegarder les chunks
    public function saveChunksToJson(array $chunks, string $filename): bool {
        return file_put_contents(
            $filename,
            json_encode($chunks, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
        ) !== false;
    }
}
