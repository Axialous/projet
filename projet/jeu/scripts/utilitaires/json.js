// Analyse un texte JSON en refusant les clés en double, que JSON.parse accepte
// silencieusement (la dernière l'emporte).
export function analyser_json(texte, source = 'JSON') {
    const donnees = JSON.parse(texte)

    // Le texte est valide : il suffit de suivre les objets ouverts pour repérer les clés.
    const pile = []
    for (let i = 0; i < texte.length; i++) {
        const caractere = texte[i]
        if (caractere === '{') pile.push({ cles: new Set(), attend_cle: true })
        else if (caractere === '[') pile.push(null)
        else if (caractere === '}' || caractere === ']') pile.pop()
        else if (caractere === ',' && pile.at(-1)) pile.at(-1).attend_cle = true
        else if (caractere === '"') {
            let fin = i + 1
            while (texte[fin] !== '"') fin += texte[fin] === '\\' ? 2 : 1
            const objet = pile.at(-1)
            if (objet?.attend_cle) {
                const cle = JSON.parse(texte.slice(i, fin + 1))
                if (objet.cles.has(cle)) {
                    const ligne = texte.slice(0, i).split('\n').length
                    throw new Error(`${source}, ligne ${ligne} : clé « ${cle} » en double`)
                }
                objet.cles.add(cle)
                objet.attend_cle = false
            }
            i = fin
        }
    }
    return donnees
}

export async function charger_json(url) {
    const reponse = await fetch(url)
    if (!reponse.ok) throw new Error(`${url} : ${reponse.status} ${reponse.statusText}`)
    return analyser_json(await reponse.text(), url)
}
