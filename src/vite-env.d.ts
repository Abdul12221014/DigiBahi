/// <reference types="vite/client" />


interface DocumentEventMap {
    "digbahi:backup": CustomEvent;
    "digbahi:restore": CustomEvent;
    "digbahi:sync": CustomEvent;
    "digbahi:open-pen-input": CustomEvent;
}

interface WindowEventMap {
    "digbahi:open-pen-input": CustomEvent;
}
