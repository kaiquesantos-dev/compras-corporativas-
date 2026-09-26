// O arquivo da proposta (até 5MB) mora no próprio banco, na coluna
// proposalFileContent. Toda consulta que devolve cotação para o cliente deve
// deixar essa coluna de fora: serializado em JSON, cada byte vira uma chave
// ("0":37,"1":80,...) e um PDF de 1MB virava uma resposta de ~12MB — em toda
// listagem e todo detalhe de solicitação. Só o download lê o conteúdo.
export const OMIT_PROPOSAL_CONTENT = { proposalFileContent: true } as const;
