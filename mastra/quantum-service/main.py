"""Micro-service FastAPI / Qiskit Aer — "Espace Lisse" du diagramme d'architecture.

Reçoit du serveur TypeScript (étape 2) les nœuds du rhizome et les arêtes
pondérées par un angle theta dérivé de l'intensité I_AB, construit un circuit
paramétré (l'"ansatz") représentant une marche quantique sur ce graphe,
l'exécute sur le simulateur Qiskit Aer (étape 3), puis renvoie la distribution
de probabilités et les concepts résonnants identifiés (étapes 4-5).

Ansatz expérimental (Phase 1 du document de conception — "vérifier la logique
mathématique pure de l'algorithme sans aucun bruit matériel") :
  1. Superposition uniforme (H) sur tous les qubits. Le qubit source reçoit en
     plus un X avant le H, pour le distinguer par un signe de phase (|-> au
     lieu de |+>) qui infléchira les interférences suivantes.
  2. Pour chaque arête (u, v, theta) : deux portes Ry(theta) contrôlées
     (CRY), u -> v et v -> u, couplant les deux qubits avec une force
     proportionnelle à l'intensité rhizomatique du lien.
  3. Mesure de tous les qubits, sur `shots` répétitions.
  4. Le score de résonance d'un nœud = probabilité marginale de mesurer son
     qubit à 1.

Ce n'est pas une implémentation canonique de QAOA ni d'une marche quantique
formelle : c'est un premier ansatz destiné à être itéré, conformément à la
démarche incrémentale du document de conception.
"""

from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

app = FastAPI(title="Rhizome Quantum Walk Service")


class EdgeInput(BaseModel):
    source: str
    target: str
    theta: float


class QuantumRunRequest(BaseModel):
    sourceId: str
    nodes: list[str]
    edges: list[EdgeInput]
    shots: int = Field(default=2048, gt=0, le=20000)
    topK: int = Field(default=5, gt=0)


class ResonantConcept(BaseModel):
    id: str
    probability: float


class BasisState(BaseModel):
    bitstring: str
    count: int
    probability: float


class QuantumRunResponse(BaseModel):
    resonantConcepts: list[ResonantConcept]
    topStates: list[BasisState]
    qubitCount: int
    shots: int


def build_ansatz(request: QuantumRunRequest, qubit_index: dict[str, int]) -> QuantumCircuit:
    n = len(request.nodes)
    circuit = QuantumCircuit(n, n)

    source_idx = qubit_index[request.sourceId]
    circuit.x(source_idx)
    circuit.h(range(n))

    for edge in request.edges:
        if edge.source not in qubit_index or edge.target not in qubit_index:
            continue
        u = qubit_index[edge.source]
        v = qubit_index[edge.target]
        circuit.cry(edge.theta, u, v)
        circuit.cry(edge.theta, v, u)

    circuit.measure(range(n), range(n))
    return circuit


@app.post("/quantum/run", response_model=QuantumRunResponse)
def run_quantum_walk(request: QuantumRunRequest) -> QuantumRunResponse:
    if request.sourceId not in request.nodes:
        raise HTTPException(status_code=400, detail=f"sourceId '{request.sourceId}' absent de la liste des nœuds")
    if len(request.nodes) == 0:
        raise HTTPException(status_code=400, detail="La liste des nœuds est vide")

    qubit_index = {node_id: i for i, node_id in enumerate(request.nodes)}
    circuit = build_ansatz(request, qubit_index)

    simulator = AerSimulator()
    result = simulator.run(circuit, shots=request.shots).result()
    counts = result.get_counts()

    n = len(request.nodes)
    marginal_ones = [0] * n
    for bitstring, count in counts.items():
        # Qiskit ordonne les bits en little-endian : le caractère le plus à
        # droite correspond au qubit 0.
        reversed_bits = bitstring[::-1]
        for i in range(n):
            if reversed_bits[i] == "1":
                marginal_ones[i] += count

    resonance = {
        node_id: marginal_ones[qubit_index[node_id]] / request.shots
        for node_id in request.nodes
        if node_id != request.sourceId
    }
    ranked = sorted(resonance.items(), key=lambda item: item[1], reverse=True)
    resonant_concepts = [ResonantConcept(id=node_id, probability=probability) for node_id, probability in ranked[: request.topK]]

    top_states_raw = sorted(counts.items(), key=lambda item: item[1], reverse=True)[:10]
    top_states = [
        BasisState(bitstring=bitstring, count=count, probability=count / request.shots) for bitstring, count in top_states_raw
    ]

    return QuantumRunResponse(
        resonantConcepts=resonant_concepts,
        topStates=top_states,
        qubitCount=n,
        shots=request.shots,
    )


@app.get("/health")
def health() -> dict[str, Literal["ok"]]:
    return {"status": "ok"}
