const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const ExpressError = require("../utils/ExpressError");

// @desc    Get Checkup Details
// route    GET /api/checkup/:id
// @access  Private (Admin)
const getCheckupDetails = async (req, res, next) => {
  const { id } = req.params;
  console.log(id);
  console.log("inside");
  const checkup = await prisma.checkup.findUnique({
    where: {
      id: id,
    },
    include: {
      Patient: {
        select: {
          name: true,
        },
      },
      Staff: {
        select: {
          name: true,
        },
      },
      Doctor: {
        select: {
          name: true,
        },
      },
      CheckupMedicine: {
        include: {
          Medicine: {
            select: {
              brandName: true,
            },
          },
        },
      },
    },
  });

  if (!checkup) {
    throw new ExpressError("Prescription does not exist", 404);
  }

  const restructuredCheckup = {
    id: checkup?.id,
    patientName: checkup.Patient?.name,
    doctorName: checkup.Doctor?.name,
    staffName: checkup.Staff?.name,
    date: checkup.date.toISOString().split("T")[0],
    diagnosis: checkup?.diagnosis,
    symptoms: checkup?.symptoms,
    temperature: checkup?.temperature,
    bloodPressure: checkup?.bloodPressure,
    pulseRate: checkup?.pulseRate,
    spO2: checkup.spO2,
    checkupMedicines: checkup.CheckupMedicine.map((medicine) => ({
      id: medicine?.id,
      brandName: medicine.Medicine?.brandName,
      dosage: medicine?.dosage,
      quantity: medicine?.quantity,
    })),
  };
  console.log("restructuredCheckup : ", restructuredCheckup);
  return res.status(200).json({
    ok: true,
    data: restructuredCheckup,
    message: "Prescription Details retrieved successfully",
  });
};

// @desc    Get Checkup List
// route    GET /api/checkup
// @access  Private (Admin)

const getCheckupList = async (req, res, next) => {
  const checkupList = await prisma.checkup.findMany({
    include: {
      Patient: {
        select: {
          name: true,
        },
      },
      Staff: {
        select: {
          name: true,
        },
      },
      Doctor: {
        select: {
          name: true,
        },
      },
    },
  });

  // console.log("checkupList : ", checkupList);

  const restructuredCheckupList = checkupList.map((checkup) => ({
    id: checkup?.id,
    patientName: checkup.Patient?.name,
    doctorName: checkup.Doctor?.name,
    staffName: checkup.Staff?.name,
    date: checkup.date.toISOString().split("T")[0],
    diagnosis: checkup?.diagnosis,
    symptoms: checkup?.symptoms,
  }));

  return res.status(200).json({
    ok: true,
    data: restructuredCheckupList,
    message: "Prescription List retrieved successfully",
  });
};

// @desc    Create Checkup Records
// route    POST /api/checkup
// @access  Private (Admin)

const createCheckup = async (req, res, next) => {
  const {
    patientId,
    doctorId,
    staffEmail,
    date,
    diagnosis,
    symptoms,
    temperature,
    bloodPressure,
    pulseRate,
    spO2,
    checkupMedicines,
  } = req.body;
  console.log("req.body : ", req.body);
  const patient = await prisma.patient.findUnique({
    where: {
      id: patientId,
    },
  });
  if (!patient) {
    throw new ExpressError("Patient does not exist", 404);
  }
  if (doctorId) {
    const doctor = await prisma.staff.findUnique({
      where: {
        id: doctorId,
        role: "DOCTOR",
      },
    });

    if (!doctor) {
      throw new ExpressError("Doctor does not exist", 404);
    }
  }

  const staff = await prisma.staff.findUnique({
    where: {
      email: staffEmail,
    },
  });

  if (!staff) {
    throw new ExpressError("Logged in Staff does not exist", 404);
  }

  //handle validations on each medicine item in checkupMedicines
  for (const [idx, medicine] of checkupMedicines.entries()) {
    if (medicine.quantity < 1) {
      throw new ExpressError(
        `Quantity should be greater than 0 for medicine with ID ${
          medicine.medicineId
        } in ITEM ${idx + 1}`,
        400
      );
    }
    const stockRecord = await prisma.stock.findFirst({
      where: {
        medicineId: medicine.medicineId,
      },
    });
    if (!stockRecord) {
      throw new ExpressError(
        `Stock record not found for medicine with ID ${
          medicine.medicineId
        } in ITEM ${idx + 1}`,
        404
      );
    }
    if (stockRecord.stock < medicine.quantity) {
      throw new ExpressError(
        `Stock not sufficient for medicine with ID ${
          medicine.medicineId
        } in ITEM ${idx + 1}`,
        400
      );
    }
  }

  for (const [idx, medicine] of checkupMedicines.entries()) {
    const medicineRecord = await prisma.medicine.findUnique({
      where: {
        id: medicine.medicineId,
      },
    });
    //updateMany is used but the entrires are unique by medicineId
    const updateStock = await prisma.stock.updateMany({
      where: {
        medicineId: medicine.medicineId,
      },
      data: {
        outQuantity: {
          increment: parseInt(medicine.quantity),
        },
        stock: {
          decrement: parseInt(medicine.quantity),
        },
      },
    });

    //if at any point, stock update fails, then rollback all the previous stock updates
    if (!updateStock) {
      for (let i = 0; i < idx; i++) {
        const previousMedicine = checkupMedicines[i];
        const previousMedicineRecord = await prisma.medicine.findUnique({
          where: {
            id: previousMedicine.medicineId,
          },
        });
        const previousStock = await prisma.stock.updateMany({
          where: {
            medicineId: previousMedicine.medicineId,
          },
          data: {
            outQuantity: {
              decrement: parseInt(previousMedicine.quantity),
            },
            stock: {
              increment: parseInt(previousMedicine.quantity),
            },
          },
        });
        if (!previousStock) {
          //give understandable error msg like 'stock partially updated, correct it manually' ****  (stock updated till this incex)
          throw new ExpressError(
            `Failed to rollback stock update for medicine ${
              previousMedicineRecord.brandName
            } with ID ${previousMedicine.medicineId} in ITEM ${i + 1}`,
            500
          );
        }
      }
      throw new ExpressError(`Failed to update stock for medicines`, 404);
    }
  }

  const createdCheckup = await prisma.checkup.create({
    data: {
      patientId,
      doctorId,
      staffId: staff.id,
      date: date + "T00:00:00Z",
      diagnosis,
      symptoms,
      temperature: parseFloat(temperature),
      bloodPressure,
      pulseRate: parseInt(pulseRate),
      spO2: parseFloat(spO2),
      CheckupMedicine: {
        create: checkupMedicines,
      },
    },
  });

  // console.log(createdCheckup);

  return res.status(200).json({
    ok: true,
    data: createdCheckup,
    message: "Prescription added successfully",
  });
};

// @desc    Delete Checkup Record
// route    DELETE /api/checkup
// @access  Private (Admin)
const deleteCheckup = async (req, res, next) => {
  // try {
    const { id } = req.params;

    const checkupRecord = await prisma.checkup.findUnique({
      where: {
        id,
      },
    });

    if (!checkupRecord) {
      throw new ExpressError("Prescription Record doesn't exist", 404);
    }

    const checkupMedicines = await prisma.checkupMedicine.findMany({
      where: {
        checkupId: id,
      },
    });
    for (const [idx, medicine] of checkupMedicines.entries()) {
      const stockRecord = await prisma.stock.findFirst({
        where: {
          medicineId: medicine.medicineId,
        },
      });
      if (stockRecord.outQuantity - medicine.quantity < 0) {
        throw new ExpressError(
          `Cannot Update Stock for medicine item ${
            idx + 1
          } on deleting the Purchase`,
          401
        );
      }
    }
    for (const [idx, medicine] of checkupMedicines.entries()) {
      const stockRecord = await prisma.stock.findFirst({
        where: {
          medicineId: medicine.medicineId,
        },
      });
      const updateStockRecord = await prisma.stock.update({
        where: {
          id: stockRecord.id,
        },
        data: {
          outQuantity: {
            decrement: medicine.quantity,
          },
          stock: {
            decrement: medicine.quantity,
          },
        },
      });

      //to rollback when error occurs at any point *******
    }

    const deletedRecords = await prisma.checkupMedicine.deleteMany({
      where: {
        checkupId: id,
      },
    });

    const deletedCheckup = await prisma.checkup.delete({
      where: {
        id,
      },
    });

    return res.status(200).json({
      ok: true,
      data: deletedRecords,
      message: "Prescription Record deleted successfully",
    });
  // } catch (err) {
  //   console.log(`Prescription List Deletion Error : ${err.message}`);

  //   let errMsg =
  //     "Deleting Prescription list record failed, Please try again later";
  //   let errCode = 500;

  //   //record does not exist
  //   if (err.code === "P2025") {
  //     errMsg = "Record does not exist";
  //     errCode = 404;
  //   }

  //   return res.status(errCode).json({
  //     ok: false,
  //     data: [],
  //     message: errMsg,
  //   });
  // }
};

module.exports = {
  getCheckupDetails,
  getCheckupList,
  createCheckup,
  deleteCheckup,
};
