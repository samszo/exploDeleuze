<?php

class ClaudeRAG {
    private $apiKey;
    private $chunkSize;
    private $conversationHistory;

    public function __construct($apiKey, $chunkSize = 4000) {
        $this->apiKey = $apiKey;
        $this->chunkSize = $chunkSize;
        $this->conversationHistory = [];
    }

    // Split document into chunks
    private function chunkDocument($text) {
        $chunks = [];
        $length = strlen($text);
        
        for ($i = 0; $i < $length; $i += $this->chunkSize) {
            $chunk = substr($text, $i, $this->chunkSize);
            $lastSpace = strrpos($chunk, ' ');
            $end = $lastSpace ? $i + $lastSpace : $i + $this->chunkSize;
            $chunks[] = substr($text, $i, $end - $i);
            $i = $end - $this->chunkSize;
        }
        
        return $chunks;
    }

    // Process a single chunk
    private function processChunk($chunk, $query = null) {
        $messages = [
            [
                'role' => 'user',
                'content' => "Document chunk to analyze:\n\n$chunk\n\n" .
                            ($query ? "Question: $query" : "Please analyze this content.")
            ]
        ];

        if (!empty($this->conversationHistory)) {
            $messages = array_merge($this->conversationHistory, $messages);
        }

        $response = $this->callClaudeAPI([
            'model' => 'claude-3-sonnet-20240229',
            'max_tokens' => 4096,
            'messages' => $messages
        ]);

        // Update conversation history
        $this->conversationHistory[] = end($messages);
        $this->conversationHistory[] = [
            'role' => 'assistant',
            'content' => $response['content'][0]['text']
        ];

        return $response['content'][0]['text'];
    }

    // Process entire document
    public function analyzeDocument($document, $query = null) {
        $chunks = $this->chunkDocument($document);
        $responses = [];

        foreach ($chunks as $chunk) {
            $responses[] = $this->processChunk($chunk, $query);
        }

        return $responses;
    }

    // Generate final summary
    public function summarizeAnalysis($responses) {
        $summaryPrompt = [
            'role' => 'user',
            'content' => "Based on the previous analyses, please provide a comprehensive summary. " .
                        "Previous chunks contained: " . implode(' ', $responses)
        ];

        $response = $this->callClaudeAPI([
            'model' => 'claude-3-sonnet-20240229',
            'max_tokens' => 4096,
            'messages' => array_merge($this->conversationHistory, [$summaryPrompt])
        ]);

        return $response['content'][0]['text'];
    }

    // Make API call to Claude
    private function callClaudeAPI($data) {
        $ch = curl_init('https://api.anthropic.com/v1/messages');
        
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'x-api-key: ' . $this->apiKey,
                'anthropic-version: 2023-06-01'
            ],
            CURLOPT_POSTFIELDS => json_encode($data)
        ]);

        $response = curl_exec($ch);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            throw new Exception("API Call Error: $error");
        }

        return json_decode($response, true);
    }

    // Clear conversation history
    public function clearHistory() {
        $this->conversationHistory = [];
    }
}
