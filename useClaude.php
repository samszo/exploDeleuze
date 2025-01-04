<?php
include('claudeRAG.php');
// Initialisation
$rag = new ClaudeRAG('');

try {
    // Analyser un document
    $document = file_get_contents('assets/data/biblioSamSzo.rdf');
    //$document = "votre_long_document";
    $responses = $rag->analyzeDocument($document);

    // Obtenir un résumé
    $summary = $rag->summarizeAnalysis($responses);
    
    echo "Summary: " . $summary;
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}