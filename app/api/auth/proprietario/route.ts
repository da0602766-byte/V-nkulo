import { loginWithCpf } from '../../../lib/cpf-login';
export async function POST(request: Request) { return loginWithCpf(request, true); }
