/ AND directly, and OR through De Morgan's law: A OR B = (A' AND B')'
        ORG 100
        LDA A
        AND B
        STA ANB
        LDA A
        CMA
        STA TMP         / TMP <- A'
        LDA B
        CMA             / AC <- B'
        AND TMP         / AC <- A' AND B'
        CMA             / AC <- A OR B
        STA AOB
        HLT
A,      HEX 5A3C
B,      HEX 0FF0
ANB,    HEX 0
AOB,    HEX 0
TMP,    HEX 0
        END
