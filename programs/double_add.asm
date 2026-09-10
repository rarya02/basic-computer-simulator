/ Double-precision addition C = A + B, where each number is a low and high word
        ORG 100
        LDA AL          / Add low halves
        ADD BL
        STA CL
        CLA             / AC <- 0, then CIL moves the carry from E into AC(0)
        CIL
        ADD AH          / Add high halves plus carry
        ADD BH
        STA CH
        HLT
AL,     DEC 12
AH,     DEC 32
BL,     DEC 40
BH,     DEC 02
CL,     DEC 0
CH,     DEC 0
        END
