import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { buildPaginationParams } from '../common/pagination/paginate';
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

  async update(id: number, dto: UpdateUserDto) {
    const current = await this.findOne(id);
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
    // ADMIN esquecido de uma configuração anterior.
    if (
      dto.role &&
      dto.role !== 'APPROVER' &&
      current.isAdminDelegate
    ) {
      data.isAdminDelegate = false;
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
  }

  // Concede ou revoga acesso ADMIN temporário a um usuário APPROVER — a
  // "delegação de férias". Só é chamado por rotas já restritas a ADMIN
  // (real ou já delegado) no controller.
  async delegateAdmin(id: number, granted: boolean) {
    const user = await this.findOne(id);

    if (granted && user.role !== 'APPROVER') {
      throw new BadRequestException(
        'Só é possível delegar acesso ADMIN para um usuário APPROVER.',
      );
    }

    return this.prisma.user.update({
      where: { id },
      data: { isAdminDelegate: granted },
      select: USER_SELECT,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Usuário removido com sucesso.' };
  }
}
