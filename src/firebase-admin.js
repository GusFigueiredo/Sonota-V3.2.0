import {
    // Inicializa o firebase no servidor
    initializeApp,
    // Encontraa a credencial indicada pela aplicação do google
    applicationDefault,
} from "firebase-admin/app";

import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const firebaseAdminApp  = initializeApp ({
    credential: applicationDefault(),
    // lê o valor carregado do arquivo .env
    projectId: process.env.FIREBASE_PROJECT_ID,
})

// auth será usado para validar o login de usuários recebidos pelo ionic
export const firebaseAuth = getAuth(firebaseAdminApp);
// firestore sera usado para gravar e consultar os perfis
export const firestore = getFirestore(firebaseAdminApp);
