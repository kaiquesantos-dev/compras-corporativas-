import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { buildPaginationParams } from '../common/pagination/paginate';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Lista de campos do usuário que é SEGURO devolver numa resposta HTTP —
// repare que "password" não está aqui. Usamos essa mesma constante em
// TODA consulta de usuário (aqui e também quando outro módulo, como
// PurchaseRequests, precisa trazer os dados do solicitante junto). Isso
// evita que alguém esqueça de excluir a senha numa consulta nova.
export const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  departmentId: true,
  createdAt: true,
  isAdminDelegate: true,
} as const;

// CRUD de usuários, restrito a ADMIN (a restrição de papel está no
// controller). Além do CRUD básico, cuida de duas coisas importantes:
// nunca devolver a senha, e sempre criptografar (hash) a senha antes de
// salvar no banco.
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Se um departamentId foi informado, confirma que ele existe de verdade
  // antes de vincular o usuário a ele — evita criar um usuário "órfão"
  // apontando para um departamento inexistente.
  private async assertDepartmentExists(departmentId?: number) {
    if (!departmentId) return;
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!department) {
      throw new NotFoundException('Departamento informado não existe.');
    }
  }

  async create(dto: CreateUserDto) {
    await this.assertDepartmentExists(dto.departmentId);
    // bcrypt.hash "embaralha" a senha de um jeito que não dá pra reverter —
    // nem nós, olhando o banco, conseguimos saber qual é a senha original.
    const password = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: { ...dto, password },
      select: USER_SELECT,
    });
  }

  async findAll(query: PaginationQueryDto) {
    const { skip, take, orderBy } = buildPaginationParams(
      query,
      ['createdAt', 'name', 'email'],
      'createdAt',
    );

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({ skip, take, orderBy, select: USER_SELECT }),
      this.prisma.user.count(),
    ]);

    return { data, total, page: query.page ?? 1, pageSize: take };
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return user;
  }

  // Um usuário com acesso ADMIN só por delegação (isAdminDelegate) NÃO é um
  // ADMIN de verdade pros fins desta checagem — ele passa no RolesGuard
  // (que trata isAdminDelegate como equivalente a ADMIN em qualquer rota
  // que exija esse papel) justamente pra poder cobrir a ausência do admin
  // no dia a dia, mas nunca deveria conseguir: (a) criar outros delegados
  // (cadeia de escalonamento de privilégio descontrolada) ou (b) alterar
  // ou remover a conta de um ADMIN de verdade (o que travaria o sistema,
  // já que só um ADMIN de verdade consegue revogar uma delegação).
  private assertRealAdmin(actor: AuthenticatedUser) {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Esta ação só pode ser realizada por um ADMIN — acesso delegado não é suficiente.',
      );
    }
  }

  async update(id: number, dto: UpdateUserDto, actor: AuthenticatedUser) {
    const current = await this.findOne(id);
    if (current.role === 'ADMIN') {
      this.assertRealAdmin(actor);
    }
    await this.assertDepartmentExists(dto.departmentId);

    const data: Record<string, unknown> = { ...dto };
    // Só gera um novo hash se o cliente realmente mandou uma senha nova —
    // senão manteríamos a senha antiga intacta.
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }

    // Se o papel está mudando pra algo diferente de APPROVER, uma
    // delegação de admin ativa deixa de fazer sentido (a feature existe
    // especificamente pra cobrir a ausência do admin via um aprovador) —
    // limpa sozinho em vez de deixar um usuário REQUESTER/BUYER com acesso
    // ADMIN esquecido de uma configuração anterior. Sempre incondicional
    // (não depende de "current.isAdminDelegate" já lido) pra não abrir uma
    // janela de corrida com um delegateAdmin() concorrente — não faz mal
    // nenhum reafirmar false quando já era false.
    if (dto.role && dto.role !== 'APPROVER') {
      data.isAdminDelegate = false;
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
  }

  // Concede ou revoga acesso ADMIN temporário a um usuário APPROVER — a
  // "delegação de férias". Restrito a um ADMIN de verdade (nunca a um
  // usuário que só tem acesso por já estar delegado — ver assertRealAdmin),
  // mesmo o RolesGuard já deixando um delegado passar pelo @Roles('ADMIN')
  // do controller inteiro.
  async delegateAdmin(id: number, granted: boolean, actor: AuthenticatedUser) {
    this.assertRealAdmin(actor);
    const user = await this.findOne(id);

    if (granted && user.role !== 'APPROVER') {
      throw new BadRequestException(
        'Só é possível delegar acesso ADMIN para um usuário APPROVER.',
      );
    }

    try {
      // Compare-and-swap: só concede se o papel ainda for APPROVER na hora
      // da escrita, fechando a corrida entre isto e um update() concorrente
      // trocando o papel do mesmo usuário (sem isso, as duas operações
      // liam o estado "antigo" antes de escrever, e uma delas podia acabar
      // deixando um REQUESTER/BUYER com isAdminDelegate=true).
      return await this.prisma.user.update({
        where: granted ? { id, role: 'APPROVER' } : { id },
        data: { isAdminDelegate: granted },
        select: USER_SELECT,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new BadRequestException(
          'Só é possível delegar acesso ADMIN para um usuário APPROVER.',
        );
      }
      throw err;
    }
  }

  async remove(id: number, actor: AuthenticatedUser) {
    const user = await this.findOne(id);
    if (user.role === 'ADMIN') {
      this.assertRealAdmin(actor);
    }
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Usuário removido com sucesso.' };
  }
}
