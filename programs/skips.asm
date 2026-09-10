/ Skip instructions taken and not taken, INC wraparound, and CIR through E.
/ A taken skip jumps over a HLT; a skip not taken runs ISZ MISS instead.
        ORG 100
        CLA             / AC = 0000
        SZA             / taken
        HLT
        SPA             / taken, AC(15) = 0
        HLT
        SNA             / not taken
        ISZ MISS
        CMA             / AC = FFFF
        SNA             / taken, AC(15) = 1
        HLT
        SPA             / not taken
        ISZ MISS
        SZA             / not taken
        ISZ MISS
        INC             / AC = 0000, E unchanged
        SZA             / taken
        HLT
        CLE
        SZE             / taken, E = 0
        HLT
        CME             / E = 1
        SZE             / not taken
        ISZ MISS
        LDA PAT         / AC = 8001, E = 1
        CIR             / AC = C000, E = 1
        STA R1
        CIR             / AC = E000, E = 0
        STA R2
        CIR             / AC = 7000, E = 0
        STA R3
        HLT
MISS,   DEC 0
PAT,    HEX 8001
R1,     HEX 0
R2,     HEX 0
R3,     HEX 0
        END
